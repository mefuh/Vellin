import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AdminRoomMemberDTO, AdminRoomMembersResponse, RoomEventListResponse } from '@vellin/shared';
import { prisma } from '../../db/prisma.js';
import { roomStore } from '../../rooms/store.js';
import { setMembershipRole } from '../../rooms/membership.js';
import { logRoomEvent, listRoomEvents } from '../../rooms/events.js';
import { requirePermission } from '../rbac/middleware.js';
import { writeAudit } from '../audit/audit.js';

/** Собирает участников комнаты: владелец + персистентные члены + live-участники. */
async function getRoomMembers(roomId: string): Promise<AdminRoomMemberDTO[] | null> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { id: true, ownerId: true, owner: { select: { username: true, avatarSeed: true, avatarUrl: true } } },
  });
  if (!room) return null;

  const memberships = await prisma.membership.findMany({
    where: { roomId },
    select: { role: true, user: { select: { id: true, username: true, avatarSeed: true, avatarUrl: true } } },
  });

  const runtime = roomStore.get(roomId);
  const live = runtime ? (await runtime.buildWelcome(room.ownerId)).participants : [];
  const liveSet = new Set(live.map((p) => p.userId));

  const map = new Map<string, AdminRoomMemberDTO>();
  map.set(room.ownerId, {
    userId: room.ownerId, username: room.owner.username, avatarSeed: room.owner.avatarSeed, avatarUrl: room.owner.avatarUrl,
    kind: 'user', role: 'owner', isLive: liveSet.has(room.ownerId), isMember: true,
  });
  for (const m of memberships) {
    map.set(m.user.id, {
      userId: m.user.id, username: m.user.username, avatarSeed: m.user.avatarSeed, avatarUrl: m.user.avatarUrl,
      kind: 'user', role: m.role === 'admin' ? 'admin' : 'member', isLive: liveSet.has(m.user.id), isMember: true,
    });
  }
  for (const p of live) {
    if (map.has(p.userId)) continue;
    const role = p.role === 'admin' || p.role === 'superadmin' ? 'admin' : p.role === 'guest' ? 'guest' : 'member';
    map.set(p.userId, {
      userId: p.userId, username: p.username, avatarSeed: p.avatarSeed, avatarUrl: p.avatarUrl,
      kind: p.kind === 'guest' ? 'guest' : 'user', role, isLive: true, isMember: false,
    });
  }

  const rank = { owner: 0, admin: 1, member: 2, guest: 3 } as const;
  return [...map.values()].sort((a, b) =>
    rank[a.role] - rank[b.role] || Number(b.isLive) - Number(a.isLive) || a.username.localeCompare(b.username),
  );
}

/**
 * Админ-управление комнатой без входа в неё: журнал событий, список участников,
 * смена ролей и удаление участников. Просмотр — rooms.view, изменения — rooms.manage.
 */
export async function adminRoomsExtraRoutes(app: FastifyInstance): Promise<void> {
  // ── Журнал событий комнаты ────────────────────────────────────────────────
  app.get<{ Params: { id: string }; Querystring: { cursor?: string; limit?: string } }>(
    '/admin/rooms/:id/events',
    { preHandler: requirePermission('rooms.view') },
    async (req, reply) => {
      const q = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(req.query);
      const result = await listRoomEvents(req.params.id, q.cursor, q.limit);
      reply.send(result satisfies RoomEventListResponse);
    },
  );

  // ── Участники ──────────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/admin/rooms/:id/members',
    { preHandler: requirePermission('rooms.view') },
    async (req, reply) => {
      const members = await getRoomMembers(req.params.id);
      if (!members) {
        reply.code(404).send({ error: 'NotFound', message: 'Комната не найдена', statusCode: 404 });
        return;
      }
      reply.send({ members } satisfies AdminRoomMembersResponse);
    },
  );

  app.post<{ Params: { id: string; userId: string } }>(
    '/admin/rooms/:id/members/:userId/role',
    { preHandler: requirePermission('rooms.manage') },
    async (req, reply) => {
      const { role } = z.object({ role: z.enum(['admin', 'member']) }).parse(req.body);
      const room = await prisma.room.findUnique({ where: { id: req.params.id }, select: { id: true, slug: true, ownerId: true } });
      if (!room) {
        reply.code(404).send({ error: 'NotFound', message: 'Комната не найдена', statusCode: 404 });
        return;
      }
      if (req.params.userId === room.ownerId) {
        reply.code(400).send({ error: 'BadRequest', message: 'Нельзя изменить роль владельца', statusCode: 400 });
        return;
      }
      const target = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { username: true } });
      const runtime = roomStore.get(room.id);
      if (runtime) await runtime.updateMembership(req.params.userId, { role });
      else await setMembershipRole(room.id, req.params.userId, role);

      logRoomEvent(room.id, 'role_change', {
        actorId: req.principal!.userId, actorName: req.principal!.username,
        data: { targetUserId: req.params.userId, targetName: target?.username ?? null, role, byAdmin: true },
      });
      await writeAudit(req, 'room.member_role', { type: 'room', id: room.id, label: room.slug }, {
        meta: { targetUserId: req.params.userId, targetName: target?.username ?? null, role },
      });
      reply.code(204).send();
    },
  );

  app.delete<{ Params: { id: string; userId: string } }>(
    '/admin/rooms/:id/members/:userId',
    { preHandler: requirePermission('rooms.manage') },
    async (req, reply) => {
      const room = await prisma.room.findUnique({ where: { id: req.params.id }, select: { id: true, slug: true, ownerId: true } });
      if (!room) {
        reply.code(404).send({ error: 'NotFound', message: 'Комната не найдена', statusCode: 404 });
        return;
      }
      if (req.params.userId === room.ownerId) {
        reply.code(400).send({ error: 'BadRequest', message: 'Нельзя удалить владельца комнаты', statusCode: 400 });
        return;
      }
      const target = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { username: true } });
      await prisma.membership.deleteMany({ where: { roomId: room.id, userId: req.params.userId } });
      const runtime = roomStore.get(room.id);
      const wasLive = runtime ? runtime.kickParticipant(req.principal!.userId, req.params.userId) : false;

      logRoomEvent(room.id, 'kick', {
        actorId: req.principal!.userId, actorName: req.principal!.username,
        data: { targetUserId: req.params.userId, targetName: target?.username ?? null, byAdmin: true },
      });
      await writeAudit(req, 'room.member_remove', { type: 'room', id: room.id, label: room.slug }, {
        meta: { targetUserId: req.params.userId, targetName: target?.username ?? null, wasLive },
      });
      reply.code(204).send();
    },
  );
}
