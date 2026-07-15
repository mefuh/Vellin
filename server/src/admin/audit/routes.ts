import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { AuditLogEntryDTO, AuditLogListResponse } from '@vellin/shared';
import { prisma } from '../../db/prisma.js';
import { requirePermission } from '../rbac/middleware.js';

const querySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  actorId: z.string().optional(),
  action: z.string().optional(),
  targetType: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  format: z.enum(['json', 'csv']).default('json'),
});

function safeParse(json: string | null): unknown {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function rowToDTO(r: {
  id: string; actorId: string | null; actorEmail: string; action: string;
  targetType: string; targetId: string | null; targetLabel: string | null;
  beforeJson: string | null; afterJson: string | null; metaJson: string;
  ip: string | null; userAgent: string | null; createdAt: Date;
}): AuditLogEntryDTO {
  return {
    id: r.id,
    actorId: r.actorId,
    actorEmail: r.actorEmail,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    targetLabel: r.targetLabel,
    before: safeParse(r.beforeJson),
    after: safeParse(r.afterJson),
    meta: (safeParse(r.metaJson) as Record<string, unknown>) ?? {},
    ip: r.ip,
    userAgent: r.userAgent,
    createdAt: r.createdAt.toISOString(),
  };
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function buildWhere(q: z.infer<typeof querySchema>): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};
  if (q.actorId) where.actorId = q.actorId;
  if (q.action) where.action = q.action;
  if (q.targetType) where.targetType = q.targetType;
  if (q.from || q.to) {
    where.createdAt = {};
    if (q.from) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(q.from);
    if (q.to) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(q.to);
  }
  if (q.q) {
    where.OR = [
      { actorEmail: { contains: q.q, mode: 'insensitive' } },
      { targetLabel: { contains: q.q, mode: 'insensitive' } },
      { targetId: { contains: q.q } },
      { action: { contains: q.q, mode: 'insensitive' } },
    ];
  }
  return where;
}

/**
 * Журнал аудита: фильтрация (актор/действие/тип объекта/диапазон дат), поиск,
 * курсор-пагинация и экспорт CSV. Только за audit.view.
 */
export async function adminAuditRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/audit', { preHandler: requirePermission('audit.view') }, async (req, reply) => {
    const q = querySchema.parse(req.query);
    const where = buildWhere(q);

    if (q.format === 'csv') {
      const rows = await prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 5000 });
      const header = ['createdAt', 'actorEmail', 'action', 'targetType', 'targetId', 'targetLabel', 'ip', 'userAgent', 'before', 'after', 'meta'];
      const lines = [header.join(',')];
      for (const r of rows) {
        const dto = rowToDTO(r);
        lines.push(
          [dto.createdAt, dto.actorEmail, dto.action, dto.targetType, dto.targetId, dto.targetLabel, dto.ip, dto.userAgent, dto.before, dto.after, dto.meta]
            .map(csvCell)
            .join(','),
        );
      }
      reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="audit-${Date.now()}.csv"`)
        .send('﻿' + lines.join('\r\n'));
      return;
    }

    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    reply.send({
      entries: page.map(rowToDTO),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    } satisfies AuditLogListResponse);
  });
}
