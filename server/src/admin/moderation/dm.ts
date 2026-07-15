import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  ModConversationListResponse,
  ModMessageDTO,
  ModMessagesResponse,
  PublicUserRef,
} from '@vellin/shared';
import { prisma } from '../../db/prisma.js';
import { loadEnv } from '../../env.js';
import { requirePermission } from '../rbac/middleware.js';
import { writeAudit } from '../audit/audit.js';

const userSelect = { id: true, publicId: true, username: true, avatarSeed: true, avatarUrl: true } as const;

function toRef(u: { id: string; publicId: string; username: string; avatarSeed: string; avatarUrl: string | null }): PublicUserRef {
  return { id: u.id, publicId: u.publicId, username: u.username, avatarSeed: u.avatarSeed, avatarUrl: u.avatarUrl };
}

/**
 * Модерация ЛС — чувствительный раздел. Гейтится правом moderation.dm.view И
 * глобальным выключателем DM_MODERATION_ENABLED; каждое открытие диалога
 * (загрузка первой страницы сообщений) пишет запись в Audit Log (dm.view).
 */
export async function adminDmModerationRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { q?: string; cursor?: string; limit?: string } }>(
    '/admin/moderation/conversations',
    { preHandler: requirePermission('moderation.dm.view') },
    async (req, reply) => {
      const enabled = loadEnv().DM_MODERATION_ENABLED;
      if (!enabled) {
        reply.send({ conversations: [], nextCursor: null, enabled: false } satisfies ModConversationListResponse);
        return;
      }
      const q = z.object({
        q: z.string().trim().min(1).max(100).optional(),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(60).default(30),
      }).parse(req.query);

      const where = q.q
        ? {
            OR: [
              { userA: { username: { contains: q.q, mode: 'insensitive' as const } } },
              { userA: { email: { contains: q.q, mode: 'insensitive' as const } } },
              { userB: { username: { contains: q.q, mode: 'insensitive' as const } } },
              { userB: { email: { contains: q.q, mode: 'insensitive' as const } } },
            ],
          }
        : {};

      const rows = await prisma.conversation.findMany({
        where,
        orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          lastMessageAt: true,
          userA: { select: userSelect },
          userB: { select: userSelect },
          _count: { select: { messages: true } },
        },
      });
      const hasMore = rows.length > q.limit;
      const page = hasMore ? rows.slice(0, q.limit) : rows;
      reply.send({
        conversations: page.map((c) => ({
          id: c.id,
          userA: toRef(c.userA),
          userB: toRef(c.userB),
          lastMessageAt: c.lastMessageAt.toISOString(),
          messageCount: c._count.messages,
        })),
        nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
        enabled: true,
      } satisfies ModConversationListResponse);
    },
  );

  app.get<{ Params: { id: string }; Querystring: { cursor?: string } }>(
    '/admin/moderation/conversations/:id/messages',
    { preHandler: requirePermission('moderation.dm.view') },
    async (req, reply) => {
      if (!loadEnv().DM_MODERATION_ENABLED) {
        reply.code(403).send({ error: 'Forbidden', message: 'Раздел модерации ЛС отключён', statusCode: 403 });
        return;
      }
      const conv = await prisma.conversation.findUnique({
        where: { id: req.params.id },
        select: { id: true, userA: { select: userSelect }, userB: { select: userSelect } },
      });
      if (!conv) {
        reply.code(404).send({ error: 'NotFound', message: 'Диалог не найден', statusCode: 404 });
        return;
      }
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

      // Аудит только при ОТКРЫТИИ (первая страница) — не на каждой подгрузке.
      if (!cursor) {
        await writeAudit(req, 'dm.view', { type: 'conversation', id: conv.id, label: `${conv.userA.username} ↔ ${conv.userB.username}` });
      }

      const rows = await prisma.directMessage.findMany({
        where: { conversationId: conv.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 41,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true, senderId: true, body: true, imageUrl: true, voiceUrl: true, videoUrl: true,
          videoStatus: true, inviteRoomName: true, createdAt: true,
          sender: { select: { username: true } },
        },
      });
      const hasMore = rows.length > 40;
      const page = hasMore ? rows.slice(0, 40) : rows;
      const messages: ModMessageDTO[] = page
        .map((m) => ({
          id: m.id,
          senderId: m.senderId,
          senderName: m.sender?.username ?? '—',
          body: m.body,
          imageUrl: m.imageUrl,
          voiceUrl: m.voiceUrl,
          videoUrl: m.videoUrl,
          videoStatus: m.videoStatus,
          inviteRoomName: m.inviteRoomName,
          createdAt: m.createdAt.toISOString(),
        }))
        .reverse(); // отдаём в хронологическом порядке

      reply.send({
        conversationId: conv.id,
        userA: toRef(conv.userA),
        userB: toRef(conv.userB),
        messages,
        nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
      } satisfies ModMessagesResponse);
    },
  );
}
