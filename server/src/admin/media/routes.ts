import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { MediaCacheEntry, MediaCacheListResponse } from '@vellin/shared';
import { prisma } from '../../db/prisma.js';
import { requirePermission } from '../rbac/middleware.js';
import { writeAudit } from '../audit/audit.js';

function toEntry(r: {
  sourceUrl: string; kind: string; title: string | null; mime: string | null;
  durationSec: number | null; poster: string | null; resolvedAt: Date; expiresAt: Date | null;
}): MediaCacheEntry {
  return {
    sourceUrl: r.sourceUrl,
    kind: r.kind,
    title: r.title,
    mime: r.mime,
    durationSec: r.durationSec,
    hasPoster: !!r.poster,
    resolvedAt: r.resolvedAt.toISOString(),
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
  };
}

const select = { sourceUrl: true, kind: true, title: true, mime: true, durationSec: true, poster: true, resolvedAt: true, expiresAt: true } as const;

/**
 * Управление кэшем разрешённых медиа (ResolvedMedia). Просмотр списка,
 * удаление отдельной записи и полная очистка. Всё за media.manage; удаление
 * пишется в аудит. Кэш переиспользуется между комнатами — очистка глобальна.
 */
export async function adminMediaRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { q?: string; cursor?: string; limit?: string } }>(
    '/admin/media',
    { preHandler: requirePermission('media.manage') },
    async (req, reply) => {
      const q = z.object({
        q: z.string().trim().min(1).max(200).optional(),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(30),
      }).parse(req.query);

      const where: Prisma.ResolvedMediaWhereInput = q.q
        ? { OR: [{ sourceUrl: { contains: q.q, mode: 'insensitive' } }, { title: { contains: q.q, mode: 'insensitive' } }] }
        : {};
      const [rows, total] = await Promise.all([
        prisma.resolvedMedia.findMany({
          where,
          select,
          orderBy: [{ resolvedAt: 'desc' }, { sourceUrl: 'desc' }],
          take: q.limit + 1,
          ...(q.cursor ? { cursor: { sourceUrl: q.cursor }, skip: 1 } : {}),
        }),
        prisma.resolvedMedia.count({ where }),
      ]);
      const hasMore = rows.length > q.limit;
      const page = hasMore ? rows.slice(0, q.limit) : rows;
      reply.send({
        entries: page.map(toEntry),
        nextCursor: hasMore ? page[page.length - 1]?.sourceUrl ?? null : null,
        total,
      } satisfies MediaCacheListResponse);
    },
  );

  app.post<{ Body: { sourceUrl?: string } }>(
    '/admin/media/delete',
    { preHandler: requirePermission('media.manage') },
    async (req, reply) => {
      const { sourceUrl } = z.object({ sourceUrl: z.string().min(1) }).parse(req.body);
      const res = await prisma.resolvedMedia.deleteMany({ where: { sourceUrl } });
      if (res.count === 0) {
        reply.code(404).send({ error: 'NotFound', message: 'Запись не найдена', statusCode: 404 });
        return;
      }
      await writeAudit(req, 'media.purge', { type: 'media', label: sourceUrl.slice(0, 120) }, { meta: { single: true } });
      reply.code(204).send();
    },
  );

  app.post('/admin/media/purge', { preHandler: requirePermission('media.manage') }, async (req, reply) => {
    const res = await prisma.resolvedMedia.deleteMany({});
    await writeAudit(req, 'media.purge', { type: 'media', label: 'весь кэш' }, { meta: { count: res.count } });
    reply.send({ count: res.count });
  });
}
