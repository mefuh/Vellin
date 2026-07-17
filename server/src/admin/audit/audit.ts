import type { FastifyRequest } from 'fastify';
import type { AuditLog } from '@prisma/client';
import type { AuditAction, AuditLogEntryDTO } from '@vellin/shared';
import { prisma } from '../../db/prisma.js';
import { logger } from '../../utils/logger.js';

function safeParse(json: string | null): unknown {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Ряд AuditLog → DTO. Единый маппер для журнала и истории в профиле-360. */
export function toAuditDTO(r: AuditLog): AuditLogEntryDTO {
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

/** История действий над пользователем (для профиля-360). */
export async function listUserAuditHistory(userId: string, limit = 20): Promise<AuditLogEntryDTO[]> {
  const rows = await prisma.auditLog.findMany({
    where: { targetType: 'user', targetId: userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map(toAuditDTO);
}

export interface AuditTarget {
  type: string;
  id?: string | null;
  label?: string | null;
}

export interface AuditOptions {
  before?: unknown;
  after?: unknown;
  meta?: Record<string, unknown>;
}

function stringifyOrNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

/**
 * Записывает административное действие в журнал аудита. Никогда не бросает —
 * сбой аудита не должен ронять само действие (логируем и продолжаем). actor и
 * IP/UA берутся из запроса. Вызывать ПОСЛЕ успешной мутации.
 */
export async function writeAudit(
  request: FastifyRequest,
  action: AuditAction | string,
  target: AuditTarget,
  opts: AuditOptions = {},
): Promise<void> {
  const principal = request.principal;
  const actorId = principal?.kind === 'user' ? principal.userId : null;
  const actorEmail =
    request.adminIdentity && actorId
      ? (await prisma.user.findUnique({ where: { id: actorId }, select: { email: true } }))?.email ?? 'unknown'
      : 'system';
  try {
    await prisma.auditLog.create({
      data: {
        actorId,
        actorEmail,
        action,
        targetType: target.type,
        targetId: target.id ?? null,
        targetLabel: target.label ?? null,
        beforeJson: stringifyOrNull(opts.before),
        afterJson: stringifyOrNull(opts.after),
        metaJson: JSON.stringify(opts.meta ?? {}),
        ip: request.ip ?? null,
        userAgent: request.headers['user-agent'] ?? null,
      },
    });
  } catch (err) {
    logger.error({ err: (err as Error).message, action, target }, 'audit: write failed');
  }
}
