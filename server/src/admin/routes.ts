import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  AdminAccessTicketRequest,
  AdminAccessTicketResponse,
  AdminBroadcastRequest,
  AdminBroadcastResponse,
  AdminCloseRoomResponse,
  AdminRoomDetailResponse,
  AdminRoomListResponse,
  AdminStatsResponse,
  AdminUserDetailResponse,
  AdminUserListResponse,
  BlockUserRequest,
  BlockUserResponse,
  RoomSummary,
  UpdateRoomRequest,
  UpdateRoomResponse,
} from '@vellin/shared';
import { requireAdmin } from '../auth/middleware.js';
import { signWsTicket } from '../auth/jwt.js';
import { loadEnv } from '../env.js';
import {
  blockUser,
  broadcastSystemMessage,
  buildStats,
  closeRoom,
  deleteRoomById,
  deleteUser,
  endRoomCall,
  getRoomForAdmin,
  getUserDetail,
  listRoomsForAdmin,
  listUsers,
  patchRoom,
  snapshotLiveRoom,
  toAdminRoomSummary,
  toRoomDetailsFromDb,
  unblockUser,
} from './service.js';
import { toRoomSummary } from '../rooms/service.js';

const userListQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const blockSchema = z.object({
  reason: z.string().max(500).optional(),
}) satisfies z.ZodType<BlockUserRequest>;

const updateRoomSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    isPrivate: z.boolean().optional(),
    password: z.union([z.string().min(4).max(64), z.null()]).optional(),
    maxParticipants: z.number().int().min(2).max(50).optional(),
    allowGuests: z.boolean().optional(),
    hostOnlyControl: z.boolean().optional(),
  })
  .refine((p) => Object.keys(p).length > 0, {
    message: 'At least one field required',
  }) satisfies z.ZodType<UpdateRoomRequest>;

const accessTicketSchema = z.object({
  mode: z.enum(['normal', 'shadow']),
}) satisfies z.ZodType<AdminAccessTicketRequest>;

const broadcastSchema = z.object({
  body: z.string().trim().min(1).max(1000),
}) satisfies z.ZodType<AdminBroadcastRequest>;

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAdmin);

  // ── Stats ────────────────────────────────────────────────────────────
  app.get('/admin/stats', async (_req, reply) => {
    const stats = await buildStats();
    reply.send(stats satisfies AdminStatsResponse);
  });

  // ── Users ────────────────────────────────────────────────────────────
  app.get<{ Querystring: { q?: string; cursor?: string; limit?: string } }>(
    '/admin/users',
    async (req, reply) => {
      const q = userListQuerySchema.parse(req.query);
      const result = await listUsers(q.q, q.cursor, q.limit);
      reply.send(result satisfies AdminUserListResponse);
    },
  );

  app.get<{ Params: { id: string } }>('/admin/users/:id', async (req, reply) => {
    const result = await getUserDetail(req.params.id);
    if (!result) {
      reply.code(404).send({ error: 'NotFound', message: 'User not found', statusCode: 404 });
      return;
    }
    const rooms: RoomSummary[] = result.rooms.map((r) => toRoomSummary(r));
    reply.send({ user: result.user, rooms } satisfies AdminUserDetailResponse);
  });

  app.delete<{ Params: { id: string } }>('/admin/users/:id', async (req, reply) => {
    const principal = req.principal!;
    if (req.params.id === principal.userId) {
      reply
        .code(400)
        .send({ error: 'BadRequest', message: 'Нельзя удалить самого себя', statusCode: 400 });
      return;
    }
    const ok = await deleteUser(req.params.id);
    if (!ok) {
      reply.code(404).send({ error: 'NotFound', message: 'User not found', statusCode: 404 });
      return;
    }
    reply.code(204).send();
  });

  app.post<{ Params: { id: string }; Body: BlockUserRequest }>(
    '/admin/users/:id/block',
    async (req, reply) => {
      const body = blockSchema.parse(req.body ?? {});
      const principal = req.principal!;
      if (req.params.id === principal.userId) {
        reply
          .code(400)
          .send({ error: 'BadRequest', message: 'Нельзя заблокировать себя', statusCode: 400 });
        return;
      }
      try {
        const user = await blockUser(req.params.id, body.reason);
        reply.send({ user } satisfies BlockUserResponse);
      } catch {
        reply.code(404).send({ error: 'NotFound', message: 'User not found', statusCode: 404 });
      }
    },
  );

  app.post<{ Params: { id: string } }>('/admin/users/:id/unblock', async (req, reply) => {
    try {
      const user = await unblockUser(req.params.id);
      reply.send({ user } satisfies BlockUserResponse);
    } catch {
      reply.code(404).send({ error: 'NotFound', message: 'User not found', statusCode: 404 });
    }
  });

  // ── Rooms ────────────────────────────────────────────────────────────
  app.get<{ Querystring: { q?: string; cursor?: string; limit?: string } }>(
    '/admin/rooms',
    async (req, reply) => {
      const q = userListQuerySchema.parse(req.query);
      const result = await listRoomsForAdmin(q.q, q.cursor, q.limit);
      reply.send(result satisfies AdminRoomListResponse);
    },
  );

  app.get<{ Params: { id: string } }>('/admin/rooms/:id', async (req, reply) => {
    const room = await getRoomForAdmin(req.params.id);
    if (!room) {
      reply.code(404).send({ error: 'NotFound', message: 'Room not found', statusCode: 404 });
      return;
    }
    const snapshot = await snapshotLiveRoom(room);
    reply.send({
      room: toAdminRoomSummary(room),
      details: toRoomDetailsFromDb(room),
      participants: snapshot.participants,
    } satisfies AdminRoomDetailResponse);
  });

  app.patch<{ Params: { id: string }; Body: UpdateRoomRequest }>(
    '/admin/rooms/:id',
    async (req, reply) => {
      const body = updateRoomSchema.parse(req.body);
      try {
        const updated = await patchRoom(req.params.id, body);
        reply.send({
          room: toAdminRoomSummary(updated),
          details: toRoomDetailsFromDb(updated),
        } satisfies UpdateRoomResponse);
      } catch (err) {
        if ((err as { code?: string }).code === 'P2025') {
          reply.code(404).send({ error: 'NotFound', message: 'Room not found', statusCode: 404 });
          return;
        }
        throw err;
      }
    },
  );

  app.delete<{ Params: { id: string } }>('/admin/rooms/:id', async (req, reply) => {
    const principal = req.principal!;
    try {
      await deleteRoomById(req.params.id, principal.userId);
      reply.code(204).send();
    } catch (err) {
      if ((err as { code?: string }).code === 'P2025') {
        reply.code(404).send({ error: 'NotFound', message: 'Room not found', statusCode: 404 });
        return;
      }
      throw err;
    }
  });

  app.post<{ Params: { id: string } }>('/admin/rooms/:id/close', async (req, reply) => {
    const principal = req.principal!;
    const kicked = await closeRoom(req.params.id, principal.userId);
    reply.send({ roomId: req.params.id, kicked } satisfies AdminCloseRoomResponse);
  });

  app.post<{ Params: { id: string } }>('/admin/rooms/:id/call/end', async (req, reply) => {
    const ended = await endRoomCall(req.params.id);
    reply.send({ roomId: req.params.id, kicked: ended } satisfies AdminCloseRoomResponse);
  });

  app.post<{ Params: { id: string }; Body: AdminAccessTicketRequest }>(
    '/admin/rooms/:id/access-ticket',
    async (req, reply) => {
      const body = accessTicketSchema.parse(req.body);
      const principal = req.principal!;
      const room = await getRoomForAdmin(req.params.id);
      if (!room) {
        reply.code(404).send({ error: 'NotFound', message: 'Room not found', statusCode: 404 });
        return;
      }
      const env = loadEnv();
      const wsTicket = signWsTicket(app, room.id, principal, env.WS_TICKET_TTL_SEC, {
        admin: true,
        shadow: body.mode === 'shadow',
      });
      reply.send({
        room: toRoomDetailsFromDb(room),
        wsTicket,
        mode: body.mode,
      } satisfies AdminAccessTicketResponse);
    },
  );

  // ── Broadcast ────────────────────────────────────────────────────────
  app.post<{ Body: AdminBroadcastRequest }>('/admin/broadcast', async (req, reply) => {
    const body = broadcastSchema.parse(req.body);
    const delivered = await broadcastSystemMessage(body.body);
    reply.send({ roomsDelivered: delivered } satisfies AdminBroadcastResponse);
  });
}
