import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type {
  BlockFriendResponse,
  DismissNotificationResponse,
  GetPublicProfileResponse,
  InviteFriendResponse,
  ListFriendRequestsResponse,
  ListFriendsResponse,
  MarkNotificationsReadRequest,
  MarkNotificationsReadResponse,
  RemoveFriendResponse,
  RespondFriendRequestResponse,
  SearchUsersResponse,
  SendFriendRequestRequest,
  SendFriendRequestResponse,
  ListNotificationsResponse,
} from '@vellin/shared';
import type { Principal } from '../auth/jwt.js';
import { requireAuth } from '../auth/middleware.js';
import { assertFriendsEnabled } from '../admin/platform/gate.js';
import {
  blockUser,
  getNotificationsSnapshot,
  getPublicProfile,
  listFriends,
  listRequests,
  markNotificationsRead,
  removeFriend,
  respondRequest,
  searchUsers,
  sendRequest,
  unblockUser,
} from './service.js';
import { removeNotificationById } from '../realtime/notify.js';

const sendRequestSchema = z
  .object({
    username: z.string().min(2).max(32).optional(),
    userId: z.string().min(1).max(64).optional(),
  })
  .refine((v) => !!v.username || !!v.userId, 'username или userId обязателен') satisfies z.ZodType<SendFriendRequestRequest>;

const markReadSchema = z.object({
  ids: z.array(z.string().min(1).max(64)).max(200).optional(),
}) satisfies z.ZodType<MarkNotificationsReadRequest>;

function deny(reply: FastifyReply, status: number, error: string, message: string): void {
  reply.code(status).send({ error, message, statusCode: status });
}

/** Достаёт принципала-пользователя (не гостя) или отвечает 403. */
function requireUser(req: FastifyRequest, reply: FastifyReply): Extract<Principal, { kind: 'user' }> | null {
  const principal = req.principal!;
  if (principal.kind !== 'user') {
    deny(reply, 403, 'Forbidden', 'Доступно только зарегистрированным пользователям');
    return null;
  }
  return principal;
}

/**
 * Друзья / поиск пользователей / публичные профили / уведомления.
 * Отдельный плагин с собственным preHandler — по образцу roomRoutes, чтобы
 * хук requireAuth не протёк на auth-роуты.
 */
export async function friendRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // ── Друзья ──────────────────────────────────────────────────────────────
  app.get('/friends', async (req, reply) => {
    const p = requireUser(req, reply);
    if (!p) return;
    reply.send({ friends: await listFriends(p.userId) } satisfies ListFriendsResponse);
  });

  app.get('/friends/requests', async (req, reply) => {
    const p = requireUser(req, reply);
    if (!p) return;
    reply.send({ requests: await listRequests(p.userId) } satisfies ListFriendRequestsResponse);
  });

  app.post('/friends/requests', async (req, reply) => {
    const p = requireUser(req, reply);
    if (!p) return;
    await assertFriendsEnabled();
    const body = sendRequestSchema.parse(req.body ?? {});
    const result = await sendRequest(p.userId, body);
    reply.code(201).send(result satisfies SendFriendRequestResponse);
  });

  app.post<{ Params: { id: string } }>('/friends/requests/:id/accept', async (req, reply) => {
    const p = requireUser(req, reply);
    if (!p) return;
    await assertFriendsEnabled();
    const status = await respondRequest(p.userId, req.params.id, true);
    reply.send({ status } satisfies RespondFriendRequestResponse);
  });

  app.post<{ Params: { id: string } }>('/friends/requests/:id/decline', async (req, reply) => {
    const p = requireUser(req, reply);
    if (!p) return;
    const status = await respondRequest(p.userId, req.params.id, false);
    reply.send({ status } satisfies RespondFriendRequestResponse);
  });

  app.delete<{ Params: { userId: string } }>('/friends/:userId', async (req, reply) => {
    const p = requireUser(req, reply);
    if (!p) return;
    await removeFriend(p.userId, req.params.userId);
    reply.send({ userId: req.params.userId } satisfies RemoveFriendResponse);
  });

  app.post<{ Params: { userId: string } }>('/friends/:userId/block', async (req, reply) => {
    const p = requireUser(req, reply);
    if (!p) return;
    await blockUser(p.userId, req.params.userId);
    reply.send({ userId: req.params.userId } satisfies BlockFriendResponse);
  });

  app.delete<{ Params: { userId: string } }>('/friends/:userId/block', async (req, reply) => {
    const p = requireUser(req, reply);
    if (!p) return;
    await unblockUser(p.userId, req.params.userId);
    reply.send({ userId: req.params.userId } satisfies BlockFriendResponse);
  });

  // ── Поиск + публичный профиль ─────────────────────────────────────────
  app.get<{ Querystring: { q?: string } }>('/users/search', async (req, reply) => {
    const p = requireUser(req, reply);
    if (!p) return;
    reply.send({ users: await searchUsers(p.userId, req.query.q ?? '') } satisfies SearchUsersResponse);
  });

  app.get<{ Params: { publicId: string } }>('/users/:publicId', async (req, reply) => {
    const p = requireUser(req, reply);
    if (!p) return;
    reply.send({ profile: await getPublicProfile(p.userId, req.params.publicId) } satisfies GetPublicProfileResponse);
  });

  // ── Уведомления ────────────────────────────────────────────────────────
  app.get('/notifications', async (req, reply) => {
    const p = requireUser(req, reply);
    if (!p) return;
    reply.send((await getNotificationsSnapshot(p.userId)) satisfies ListNotificationsResponse);
  });

  app.post('/notifications/read', async (req, reply) => {
    const p = requireUser(req, reply);
    if (!p) return;
    const body = markReadSchema.parse(req.body ?? {});
    const unreadCount = await markNotificationsRead(p.userId, body.ids);
    reply.send({ unreadCount } satisfies MarkNotificationsReadResponse);
  });

  // Удалить одно уведомление (напр. приглашение в комнату после перехода).
  app.delete<{ Params: { id: string } }>('/notifications/:id', async (req, reply) => {
    const p = requireUser(req, reply);
    if (!p) return;
    const unreadCount = await removeNotificationById(p.userId, req.params.id);
    reply.send({ unreadCount } satisfies DismissNotificationResponse);
  });
}
