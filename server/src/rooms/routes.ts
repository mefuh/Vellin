import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  CreateInviteRequest,
  CreateInviteResponse,
  CreateRoomRequest,
  CreateRoomResponse,
  GetRoomResponse,
  InviteFriendRequest,
  InviteFriendResponse,
  InviteLink as InviteLinkDTO,
  JoinRoomRequest,
  JoinRoomResponse,
  KickMemberResponse,
  ListRoomsResponse,
  MessagesResponse,
  ResolveRequest,
  ResolveResponse,
  SetVideoUrlRequest,
  SetVideoUrlResponse,
  UpdateMemberPermissionsRequest,
  UpdateMemberPermissionsResponse,
  UpdateMemberRoleRequest,
  UpdateMemberRoleResponse,
} from '@vellin/shared';
import { prisma } from '../db/prisma.js';
import { requireAuth } from '../auth/middleware.js';
import { signWsTicket } from '../auth/jwt.js';
import { areFriends } from '../friends/service.js';
import { notifyAsync } from '../push/notificationService.js';
import { createOrUpdateRoomInviteCard, DmError } from '../dm/service.js';
import { broadcastRoomInviteCard } from '../dm/realtime.js';
import {
  authorizeJoin,
  createRoom,
  getRoomById,
  getRoomBySlug,
  listAccessibleRooms,
  RoomServiceError,
  toRoomDetails,
} from './service.js';
import { roomStore } from './store.js';
import { ensureRoomRuntime } from './RoomRuntime.js';
import { loadEnv } from '../env.js';
import { generateInviteToken } from '../utils/ids.js';
import { resolveWithCache } from '../media/resolveWithCache.js';
import { ResolveError } from '../media/Resolver.js';
import { assertRoomCreationEnabled, assertInvitesEnabled } from '../admin/platform/gate.js';
import { logRoomEvent } from './events.js';

/** Имя пользователя для журнала событий (best-effort, не блокирует ответ). */
async function nameFor(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
  return u?.username ?? null;
}

const URL_PATTERN = /^https?:\/\/.+/i;
const RESOLVE_URL_PATTERN = /^(https?:\/\/|magnet:).+/i;

const createRoomSchema = z.object({
  name: z.string().min(1).max(80),
  isPrivate: z.boolean(),
  password: z.string().min(4).max(64).optional(),
  maxParticipants: z.number().int().min(2).max(50).optional(),
  allowGuests: z.boolean().optional(),
  hostOnlyControl: z.boolean().optional(),
  videoUrl: z.string().regex(URL_PATTERN, 'Must be an http(s) URL').max(2048).optional(),
}) satisfies z.ZodType<CreateRoomRequest>;

const joinRoomSchema = z.object({
  slug: z.string().min(1).max(80),
  password: z.string().max(64).optional(),
  inviteToken: z.string().max(64).optional(),
}) satisfies z.ZodType<JoinRoomRequest>;

const setVideoSchema = z.object({
  url: z.string().regex(URL_PATTERN, 'Must be an http(s) URL').max(2048),
}) satisfies z.ZodType<SetVideoUrlRequest>;

const resolveSchema = z.object({
  url: z.string().regex(RESOLVE_URL_PATTERN, 'Must be an http(s) or magnet URL').max(2048),
}) satisfies z.ZodType<ResolveRequest>;

const createInviteSchema = z.object({
  maxUses: z.number().int().positive().max(1000).optional(),
  expiresAt: z.string().datetime().optional(),
}) satisfies z.ZodType<CreateInviteRequest>;

const inviteFriendSchema = z.object({
  friendId: z.string().min(1).max(64),
}) satisfies z.ZodType<InviteFriendRequest>;

const updateRoleSchema = z.object({
  role: z.enum(['admin', 'member']),
}) satisfies z.ZodType<UpdateMemberRoleRequest>;

const updatePermissionsSchema = z.object({
  permissions: z
    .object({
      canPlayPause: z.boolean().optional(),
      canSeek: z.boolean().optional(),
      canSetVideoUrl: z.boolean().optional(),
      canManagePlaylist: z.boolean().optional(),
    })
    .refine((p) => Object.keys(p).length > 0, { message: 'At least one permission required' }),
}) satisfies z.ZodType<UpdateMemberPermissionsRequest>;

export async function roomRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.post('/rooms', async (req, reply) => {
    await assertRoomCreationEnabled();
    const body = createRoomSchema.parse(req.body);
    const principal = req.principal!;
    if (principal.kind === 'guest') {
      reply.code(403).send({
        error: 'Forbidden',
        message: 'Guests cannot create rooms',
        statusCode: 403,
      });
      return;
    }
    if (body.isPrivate && !body.password) {
      reply.code(400).send({
        error: 'BadRequest',
        message: 'Private rooms require a password',
        statusCode: 400,
      });
      return;
    }
    const room = await createRoom({
      name: body.name,
      isPrivate: body.isPrivate,
      password: body.password,
      maxParticipants: body.maxParticipants ?? 20,
      allowGuests: body.allowGuests ?? true,
      hostOnlyControl: body.hostOnlyControl ?? false,
      videoUrl: body.videoUrl,
      ownerId: principal.userId,
    });
    reply.code(201).send({ room } satisfies CreateRoomResponse);
  });

  app.get('/rooms', async (req, reply) => {
    const principal = req.principal!;
    const rooms = await listAccessibleRooms(principal.userId);
    reply.send({ rooms } satisfies ListRoomsResponse);
  });

  app.get<{ Params: { slug: string } }>('/rooms/:slug', async (req, reply) => {
    const room = await getRoomBySlug(req.params.slug);
    if (!room) {
      reply.code(404).send({ error: 'NotFound', message: 'Room not found', statusCode: 404 });
      return;
    }
    reply.send({ room } satisfies GetRoomResponse);
  });

  app.post('/rooms/join', async (req, reply) => {
    const body = joinRoomSchema.parse(req.body);
    const principal = req.principal!;
    try {
      const room = await authorizeJoin(
        body.slug,
        { userId: principal.userId, isGuest: principal.kind === 'guest' },
        body.password,
        body.inviteToken,
      );
      await ensureRoomRuntime(room);
      const env = loadEnv();
      // Принципал из session-JWT может нести устаревшие username/avatarSeed/
      // avatarUrl: токен подписывается при логине и НЕ перевыпускается при смене
      // профиля на другом устройстве (а /auth/me обновляет только user, не токен).
      // В комнате участники рисуются по данным тикета, поэтому подтягиваем свежий
      // профиль из БД — иначе у людей со старыми токенами вместо аватарок висят
      // старые градиенты.
      let ticketPrincipal = principal;
      if (principal.kind === 'user') {
        const fresh = await prisma.user.findUnique({
          where: { id: principal.userId },
          select: { username: true, avatarSeed: true, avatarUrl: true },
        });
        if (fresh) {
          ticketPrincipal = {
            ...principal,
            username: fresh.username,
            avatarSeed: fresh.avatarSeed,
            avatarUrl: fresh.avatarUrl,
          };
        }
      }
      const wsTicket = signWsTicket(app, room.id, ticketPrincipal, env.WS_TICKET_TTL_SEC);
      reply.send({
        room: toRoomDetails(room),
        wsTicket,
      } satisfies JoinRoomResponse);
    } catch (err) {
      if (err instanceof RoomServiceError) {
        reply.code(err.status).send({
          error: err.status === 401 ? 'Unauthorized' : err.status === 403 ? 'Forbidden' : err.status === 404 ? 'NotFound' : 'Conflict',
          message: err.message,
          statusCode: err.status,
        });
        return;
      }
      throw err;
    }
  });

  app.post<{ Params: { id: string }; Body: SetVideoUrlRequest }>('/rooms/:id/video', async (req, reply) => {
    const body = setVideoSchema.parse(req.body);
    const principal = req.principal!;
    const room = await getRoomById(req.params.id);
    if (!room) {
      reply.code(404).send({ error: 'NotFound', message: 'Room not found', statusCode: 404 });
      return;
    }
    const runtime = await ensureRoomRuntime(room);
    if (!runtime.assertPermission(principal.userId, 'canSetVideoUrl')) {
      reply.code(403).send({ error: 'Forbidden', message: 'You cannot change the video', statusCode: 403 });
      return;
    }
    runtime.signalVideoLoading(principal.userId, true, { sourceUrl: body.url });
    try {
      const resolved = await resolveWithCache(body.url);
      await runtime.setVideoUrl(body.url, principal.userId, true, null, resolved);
    } catch (err) {
      runtime.signalVideoLoading(principal.userId, false);
      const userMessage =
        err instanceof ResolveError ? err.userMessage : 'Could not resolve this media link';
      reply
        .code(422)
        .send({ error: 'UnprocessableEntity', message: userMessage, statusCode: 422 });
      return;
    }
    const updated = await getRoomById(req.params.id);
    reply.send({ room: toRoomDetails(updated!) } satisfies SetVideoUrlResponse);
  });

  app.post<{ Body: ResolveRequest }>('/rooms/resolve', async (req, reply) => {
    const body = resolveSchema.parse(req.body);
    try {
      const resolved = await resolveWithCache(body.url);
      reply.send(resolved satisfies ResolveResponse);
    } catch (err) {
      const userMessage =
        err instanceof ResolveError ? err.userMessage : 'Could not resolve this media link';
      reply
        .code(422)
        .send({ error: 'UnprocessableEntity', message: userMessage, statusCode: 422 });
    }
  });

  // ── Member management ──────────────────────────────────────────────────

  app.post<{ Params: { id: string; userId: string }; Body: UpdateMemberRoleRequest }>(
    '/rooms/:id/members/:userId/role',
    async (req, reply) => {
      const body = updateRoleSchema.parse(req.body);
      const principal = req.principal!;
      const room = await getRoomById(req.params.id);
      if (!room) {
        reply.code(404).send({ error: 'NotFound', message: 'Room not found', statusCode: 404 });
        return;
      }
      if (room.ownerId !== principal.userId) {
        reply
          .code(403)
          .send({ error: 'Forbidden', message: 'Only the owner can change roles', statusCode: 403 });
        return;
      }
      if (req.params.userId === principal.userId) {
        reply
          .code(400)
          .send({ error: 'BadRequest', message: 'Cannot act on yourself', statusCode: 400 });
        return;
      }
      if (req.params.userId === room.ownerId) {
        reply
          .code(400)
          .send({ error: 'BadRequest', message: 'Cannot change the owner role', statusCode: 400 });
        return;
      }
      const runtime = await ensureRoomRuntime(room);
      const result = await runtime.updateMembership(req.params.userId, { role: body.role });
      logRoomEvent(room.id, 'role_change', {
        actorId: principal.userId,
        actorName: principal.username,
        data: { targetUserId: req.params.userId, targetName: await nameFor(req.params.userId), role: body.role },
      });
      reply.send({
        userId: req.params.userId,
        role: result.role,
        permissions: result.permissions,
      } satisfies UpdateMemberRoleResponse);
    },
  );

  app.patch<{
    Params: { id: string; userId: string };
    Body: UpdateMemberPermissionsRequest;
  }>('/rooms/:id/members/:userId/permissions', async (req, reply) => {
    const body = updatePermissionsSchema.parse(req.body);
    const principal = req.principal!;
    const room = await getRoomById(req.params.id);
    if (!room) {
      reply.code(404).send({ error: 'NotFound', message: 'Room not found', statusCode: 404 });
      return;
    }
    if (room.ownerId !== principal.userId) {
      reply
        .code(403)
        .send({ error: 'Forbidden', message: 'Only the owner can change permissions', statusCode: 403 });
      return;
    }
    if (req.params.userId === principal.userId) {
      reply
        .code(400)
        .send({ error: 'BadRequest', message: 'Cannot act on yourself', statusCode: 400 });
      return;
    }
    if (req.params.userId === room.ownerId) {
      reply
        .code(400)
        .send({ error: 'BadRequest', message: 'Owner permissions are fixed', statusCode: 400 });
      return;
    }
    const runtime = await ensureRoomRuntime(room);
    const targetRole = runtime.getRole(req.params.userId);
    if (targetRole === 'admin') {
      reply.code(409).send({
        error: 'Conflict',
        message: 'Admin permissions are always full — demote to member first',
        statusCode: 409,
      });
      return;
    }
    const result = await runtime.updateMembership(req.params.userId, {
      permissions: body.permissions,
    });
    logRoomEvent(room.id, 'permissions_change', {
      actorId: principal.userId,
      actorName: principal.username,
      data: { targetUserId: req.params.userId, targetName: await nameFor(req.params.userId) },
    });
    reply.send({
      userId: req.params.userId,
      role: result.role,
      permissions: result.permissions,
    } satisfies UpdateMemberPermissionsResponse);
  });

  app.delete<{ Params: { id: string; userId: string } }>(
    '/rooms/:id/members/:userId',
    async (req, reply) => {
      const principal = req.principal!;
      const room = await getRoomById(req.params.id);
      if (!room) {
        reply.code(404).send({ error: 'NotFound', message: 'Room not found', statusCode: 404 });
        return;
      }
      if (req.params.userId === principal.userId) {
        reply
          .code(400)
          .send({ error: 'BadRequest', message: 'Cannot kick yourself', statusCode: 400 });
        return;
      }
      if (req.params.userId === room.ownerId) {
        reply
          .code(400)
          .send({ error: 'BadRequest', message: 'Cannot kick the owner', statusCode: 400 });
        return;
      }
      const runtime = await ensureRoomRuntime(room);
      const callerRole = runtime.getRole(principal.userId);
      if (callerRole !== 'owner' && callerRole !== 'admin') {
        reply
          .code(403)
          .send({ error: 'Forbidden', message: 'Only admins can kick', statusCode: 403 });
        return;
      }
      const targetRole = runtime.getRole(req.params.userId);
      if (callerRole === 'admin' && (targetRole === 'admin' || targetRole === 'owner')) {
        reply.code(403).send({
          error: 'Forbidden',
          message: 'Admins cannot kick other admins',
          statusCode: 403,
        });
        return;
      }
      const ok = runtime.kickParticipant(principal.userId, req.params.userId);
      if (!ok) {
        reply
          .code(404)
          .send({ error: 'NotFound', message: 'Participant is not connected', statusCode: 404 });
        return;
      }
      logRoomEvent(room.id, 'kick', {
        actorId: principal.userId,
        actorName: principal.username,
        data: { targetUserId: req.params.userId, targetName: await nameFor(req.params.userId) },
      });
      reply.send({ userId: req.params.userId } satisfies KickMemberResponse);
    },
  );

  app.post<{ Params: { id: string }; Body: CreateInviteRequest }>(
    '/rooms/:id/invites',
    async (req, reply) => {
      await assertInvitesEnabled();
      const body = createInviteSchema.parse(req.body ?? {});
      const principal = req.principal!;
      const room = await getRoomById(req.params.id);
      if (!room) {
        reply.code(404).send({ error: 'NotFound', message: 'Room not found', statusCode: 404 });
        return;
      }
      if (room.ownerId !== principal.userId) {
        reply.code(403).send({ error: 'Forbidden', message: 'Only host can create invites', statusCode: 403 });
        return;
      }
      const token = generateInviteToken();
      const invite = await prisma.inviteLink.create({
        data: {
          roomId: room.id,
          token,
          maxUses: body.maxUses ?? null,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        },
      });
      const env = loadEnv();
      const origin = req.headers.origin?.toString() ?? env.CORS_ORIGIN;
      const link: InviteLinkDTO = {
        token: invite.token,
        url: `${origin}/room/${room.slug}?invite=${invite.token}`,
        maxUses: invite.maxUses,
        uses: invite.uses,
        expiresAt: invite.expiresAt?.toISOString() ?? null,
        createdAt: invite.createdAt.toISOString(),
      };
      reply.code(201).send({ link } satisfies CreateInviteResponse);
    },
  );

  // ── Пригласить друга в эту комнату (уведомление + ссылка) ──────────────
  app.post<{ Params: { id: string }; Body: InviteFriendRequest }>(
    '/rooms/:id/invite-friend',
    async (req, reply) => {
      await assertInvitesEnabled();
      const body = inviteFriendSchema.parse(req.body ?? {});
      const principal = req.principal!;
      if (body.friendId === principal.userId) {
        reply.code(400).send({ error: 'BadRequest', message: 'Нельзя пригласить самого себя', statusCode: 400 });
        return;
      }
      const room = await getRoomById(req.params.id);
      if (!room) {
        reply.code(404).send({ error: 'NotFound', message: 'Room not found', statusCode: 404 });
        return;
      }
      // Приглашать может владелец или тот, кто сейчас в комнате.
      const runtime = roomStore.get(room.id);
      const inRoom = room.ownerId === principal.userId || (runtime?.participants.has(principal.userId) ?? false);
      if (!inRoom) {
        reply.code(403).send({ error: 'Forbidden', message: 'Вы не находитесь в этой комнате', statusCode: 403 });
        return;
      }
      if (!(await areFriends(principal.userId, body.friendId))) {
        reply.code(403).send({ error: 'Forbidden', message: 'Можно приглашать только друзей', statusCode: 403 });
        return;
      }
      // Ссылка с одноразовым использованием не нужна — создаём обычный токен,
      // чтобы друг мог войти даже в приватную комнату.
      const token = generateInviteToken();
      await prisma.inviteLink.create({ data: { roomId: room.id, token } });
      // Карточка-приглашение в ЛС вместо колокольчика — интерактивная, с состояниями.
      try {
        const cardResult = await createOrUpdateRoomInviteCard(principal.userId, body.friendId, room, token);
        await broadcastRoomInviteCard(cardResult);
      } catch (err) {
        if (err instanceof DmError) {
          reply.code(403).send({ error: 'Forbidden', message: err.message, statusCode: 403 });
          return;
        }
        throw err;
      }
      // Web-Push приглашённому: имя приглашающего + название/ссылка комнаты.
      const inviter = await prisma.user.findUnique({
        where: { id: principal.userId },
        select: { username: true },
      });
      notifyAsync(body.friendId, 'room_invite', {
        username: inviter?.username ?? 'Кто-то',
        roomName: room.name,
        roomSlug: `${room.slug}?invite=${token}`,
      });
      reply.send({ ok: true } satisfies InviteFriendResponse);
    },
  );

  app.get<{ Params: { id: string }; Querystring: { cursor?: string; limit?: string } }>(
    '/rooms/:id/messages',
    async (req, reply) => {
      const limit = Math.min(Math.max(parseInt(req.query.limit ?? '50', 10) || 50, 1), 100);
      const cursor = req.query.cursor;
      const room = await getRoomById(req.params.id);
      if (!room) {
        reply.code(404).send({ error: 'NotFound', message: 'Room not found', statusCode: 404 });
        return;
      }
      const messages = await prisma.message.findMany({
        where: { roomId: room.id },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: { user: { select: { id: true, username: true, avatarSeed: true, avatarUrl: true } } },
      });
      const hasMore = messages.length > limit;
      const page = hasMore ? messages.slice(0, limit) : messages;
      const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;
      reply.send({
        messages: page
          .map((m) => ({
            id: m.id,
            roomId: m.roomId,
            kind: (m.kind === 'system' ? 'system' : 'user') as 'system' | 'user',
            body: m.body,
            createdAt: m.createdAt.toISOString(),
            author: m.user
              ? {
                  id: m.user.id,
                  username: m.user.username,
                  avatarSeed: m.user.avatarSeed,
                  avatarUrl: m.user.avatarUrl,
                  kind: 'user' as const,
                }
              : {
                  id: m.userId ?? 'guest',
                  username: m.guestName ?? 'Guest',
                  avatarSeed: m.guestAvatarSeed ?? 'guest',
                  avatarUrl: null,
                  kind: 'guest' as const,
                },
          }))
          .reverse(),
        nextCursor,
      } satisfies MessagesResponse);
    },
  );
}

// roomStore re-export keeps the type referenced in build context — actual use happens
// through service helpers above.
export { roomStore };
