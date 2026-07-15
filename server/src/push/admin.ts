import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  BroadcastAudience,
  NotificationTemplateDTO,
  PushBroadcastDTO,
  PushDashboardDTO,
  PushDashboardResponse,
  PushStatsDTO,
  PushTemplatesResponse,
  PushBroadcastsResponse,
  SendBroadcastResponse,
} from '@vellin/shared';
import { requirePermission } from '../admin/rbac/middleware.js';
import { writeAudit } from '../admin/audit/audit.js';
import { prisma } from '../db/prisma.js';
import { loadEnv } from '../env.js';
import { logger } from '../utils/logger.js';
import { invalidateTemplateCache } from './templates.js';
import { broadcastNotify } from './notificationService.js';

// ── Dashboard + stats ──────────────────────────────────────────────────────

async function buildDashboard(): Promise<PushDashboardDTO> {
  const since = (ms: number): Date => new Date(Date.now() - ms);
  const [totalDevices, activeDevices, totalUsers, disabledRows, activeUserRows, sentDay, sentWeek, sentMonth, queuePending] =
    await Promise.all([
      prisma.pushSubscription.count(),
      prisma.pushSubscription.count({ where: { active: true } }),
      prisma.user.count(),
      prisma.notificationPreference.findMany({ where: { pushEnabled: false }, select: { userId: true } }),
      prisma.pushSubscription.findMany({ where: { active: true }, select: { userId: true }, distinct: ['userId'] }),
      prisma.pushDelivery.count({ where: { status: 'sent', sentAt: { gte: since(24 * 3600_000) } } }),
      prisma.pushDelivery.count({ where: { status: 'sent', sentAt: { gte: since(7 * 24 * 3600_000) } } }),
      prisma.pushDelivery.count({ where: { status: 'sent', sentAt: { gte: since(30 * 24 * 3600_000) } } }),
      prisma.pushJob.count({ where: { status: 'pending' } }),
    ]);
  const disabledSet = new Set(disabledRows.map((r) => r.userId));
  const activeUserIds = activeUserRows.map((r) => r.userId);
  const usersWithPush = activeUserIds.filter((id) => !disabledSet.has(id)).length;
  const usersPushDisabled = activeUserIds.filter((id) => disabledSet.has(id)).length;
  const optInPercent = totalUsers > 0 ? Math.round((usersWithPush / totalUsers) * 1000) / 10 : 0;
  return {
    totalDevices,
    activeDevices,
    usersWithPush,
    usersPushDisabled,
    optInPercent,
    sentDay,
    sentWeek,
    sentMonth,
    queuePending,
  };
}

async function buildStats(windowDays = 30): Promise<PushStatsDTO> {
  const since = new Date(Date.now() - windowDays * 24 * 3600_000);
  const grouped = await prisma.pushDelivery.groupBy({
    by: ['status'],
    where: { sentAt: { gte: since } },
    _count: { _all: true },
  });
  const get = (s: string): number => grouped.find((g) => g.status === s)?._count._all ?? 0;
  const sent = get('sent');
  const clickedRows = await prisma.pushDelivery.count({ where: { clickedAt: { not: null }, sentAt: { gte: since } } });
  const browsers = await prisma.pushDelivery.groupBy({
    by: ['browser'],
    where: { status: 'sent', sentAt: { gte: since } },
    _count: { _all: true },
    orderBy: { _count: { browser: 'desc' } },
    take: 6,
  });
  return {
    sent,
    failed: get('failed'),
    expired: get('expired'),
    rejected: get('rejected'),
    clicked: clickedRows,
    ctr: sent > 0 ? Math.round((clickedRows / sent) * 1000) / 10 : 0,
    byBrowser: browsers.map((b) => ({ browser: b.browser || 'неизвестно', sent: b._count._all })),
  };
}

// ── Templates ────────────────────────────────────────────────────────────

function rowToTemplateDTO(r: {
  type: string; title: string; body: string; icon: string; badge: string; image: string | null;
  url: string; sound: string | null; ttl: number; urgency: string; requireInteraction: boolean;
  tag: string | null; silent: boolean; enabled: boolean; updatedAt: Date;
}): NotificationTemplateDTO {
  return {
    type: r.type as NotificationTemplateDTO['type'],
    title: r.title, body: r.body, icon: r.icon, badge: r.badge, image: r.image, url: r.url,
    sound: r.sound, ttl: r.ttl, urgency: r.urgency as NotificationTemplateDTO['urgency'],
    requireInteraction: r.requireInteraction, tag: r.tag, silent: r.silent, enabled: r.enabled,
    updatedAt: r.updatedAt.toISOString(),
  };
}

// ── Broadcast ──────────────────────────────────────────────────────────────

async function resolveAudience(audience: BroadcastAudience): Promise<string[]> {
  if (audience.kind === 'users') return audience.userIds.slice(0, 100000);
  const adminEmail = loadEnv().ADMIN_EMAIL;
  if (audience.kind === 'role') {
    const where =
      audience.role === 'admin'
        ? adminEmail
          ? { email: adminEmail }
          : { id: '__none__' }
        : adminEmail
          ? { email: { not: adminEmail } }
          : {};
    const rows = await prisma.user.findMany({ where, select: { id: true } });
    return rows.map((r) => r.id);
  }
  const rows = await prisma.user.findMany({ select: { id: true } });
  return rows.map((r) => r.id);
}

const broadcastSchema = z.object({
  type: z.enum(['system', 'news', 'marketing']),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(500),
  url: z.string().max(512).default('/'),
  audience: z.union([
    z.object({ kind: z.literal('all') }),
    z.object({ kind: z.literal('role'), role: z.enum(['admin', 'user']) }),
    z.object({ kind: z.literal('users'), userIds: z.array(z.string()).min(1).max(100000) }),
  ]),
});

const updateTemplateSchema = z.object({
  title: z.string().max(200).optional(),
  body: z.string().max(1000).optional(),
  icon: z.string().max(512).optional(),
  badge: z.string().max(512).optional(),
  image: z.string().max(512).nullable().optional(),
  url: z.string().max(512).optional(),
  sound: z.string().max(512).nullable().optional(),
  ttl: z.number().int().min(0).max(2419200).optional(),
  urgency: z.enum(['very-low', 'low', 'normal', 'high']).optional(),
  requireInteraction: z.boolean().optional(),
  tag: z.string().max(120).nullable().optional(),
  silent: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

/**
 * Админ-API push: дашборд, статистика, редактор шаблонов, массовые рассылки и
 * их история. Отдельный плагин с собственным requireAdmin-хуком (как adminRoutes).
 */
export async function adminPushRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/push/dashboard', { preHandler: requirePermission('push.view') }, async (_req, reply) => {
    const [dashboard, stats] = await Promise.all([buildDashboard(), buildStats()]);
    reply.send({ dashboard, stats } satisfies PushDashboardResponse);
  });

  app.get('/admin/push/templates', { preHandler: requirePermission('push.view') }, async (_req, reply) => {
    const rows = await prisma.notificationTemplate.findMany({ orderBy: { type: 'asc' } });
    reply.send({ templates: rows.map(rowToTemplateDTO) } satisfies PushTemplatesResponse);
  });

  app.put<{ Params: { type: string } }>(
    '/admin/push/templates/:type',
    { preHandler: requirePermission('push.templates') },
    async (req, reply) => {
      const patch = updateTemplateSchema.parse(req.body);
      try {
        const updated = await prisma.notificationTemplate.update({
          where: { type: req.params.type },
          data: { ...patch, updatedBy: req.principal!.userId },
        });
        invalidateTemplateCache();
        await writeAudit(req, 'push.template_update', { type: 'push_template', id: req.params.type, label: req.params.type }, {
          after: patch,
        });
        reply.send({ template: rowToTemplateDTO(updated) });
      } catch {
        reply.code(404).send({ error: 'NotFound', message: 'Шаблон не найден', statusCode: 404 });
      }
    },
  );

  app.get('/admin/push/broadcasts', { preHandler: requirePermission('push.view') }, async (_req, reply) => {
    const rows = await prisma.pushBroadcast.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    const broadcasts: PushBroadcastDTO[] = rows.map((r) => ({
      id: r.id,
      type: r.type as PushBroadcastDTO['type'],
      title: r.title,
      body: r.body,
      url: r.url,
      audience: safeAudience(r.audienceJson),
      totalTargets: r.totalTargets,
      sent: r.sent,
      failed: r.failed,
      createdAt: r.createdAt.toISOString(),
    }));
    reply.send({ broadcasts } satisfies PushBroadcastsResponse);
  });

  app.post('/admin/push/broadcast', { preHandler: requirePermission('push.send') }, async (req, reply) => {
    const body = broadcastSchema.parse(req.body);
    const adminId = req.principal!.userId;
    const targets = await resolveAudience(body.audience);
    const record = await prisma.pushBroadcast.create({
      data: {
        adminId,
        audienceJson: JSON.stringify(body.audience),
        type: body.type,
        title: body.title,
        body: body.body,
        url: body.url,
        totalTargets: targets.length,
      },
    });
    // Постановка в очередь — в фоне (аудитория может быть большой); итоги
    // sent/failed дописываем в запись истории по завершении.
    void runBroadcast(record.id, body.type, body.title, body.body, body.url, targets);
    await writeAudit(req, 'push.broadcast', { type: 'push_broadcast', id: record.id, label: body.title }, {
      meta: { audience: body.audience, totalTargets: targets.length, type: body.type },
    });
    reply.send({ ok: true, totalTargets: targets.length, queued: targets.length } satisfies SendBroadcastResponse);
  });
}

function safeAudience(json: string): BroadcastAudience {
  try {
    return JSON.parse(json) as BroadcastAudience;
  } catch {
    return { kind: 'all' };
  }
}

/** Фоновая постановка рассылки в очередь батчами + дозапись итогов. */
async function runBroadcast(
  broadcastId: string,
  type: 'system' | 'news' | 'marketing',
  title: string,
  bodyText: string,
  url: string,
  targets: string[],
): Promise<void> {
  let sent = 0;
  let failed = 0;
  const CHUNK = 200;
  for (let i = 0; i < targets.length; i += CHUNK) {
    const slice = targets.slice(i, i + CHUNK);
    const results = await Promise.all(
      slice.map((uid) => broadcastNotify(uid, type, { title, body: bodyText, url }).catch(() => false)),
    );
    sent += results.filter(Boolean).length;
    failed += results.filter((r) => !r).length;
  }
  await prisma.pushBroadcast.update({ where: { id: broadcastId }, data: { sent, failed } }).catch(() => {});
  logger.info({ broadcastId, sent, failed, total: targets.length }, 'push broadcast queued');
}
