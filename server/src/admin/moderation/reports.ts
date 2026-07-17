import type { FastifyInstance } from 'fastify';
import type { Report } from '@prisma/client';
import { z } from 'zod';
import type {
  CreateReportRequest,
  ReportDTO,
  ReportListResponse,
  ReportReason,
  ReportStatus,
  ReportTargetType,
} from '@vellin/shared';
import { prisma } from '../../db/prisma.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../rbac/middleware.js';
import { userHasAdminRole } from '../rbac/roles.js';
import { writeAudit } from '../audit/audit.js';
import { blockUser } from '../service.js';
import { isFeatureEnabled } from '../platform/flags.js';
import { FEATURE_FLAG_REPORTS } from '@vellin/shared';
import { broadcastNotify } from '../../push/notificationService.js';
import { logger } from '../../utils/logger.js';

const REASONS: ReportReason[] = ['spam', 'harassment', 'nsfw', 'illegal', 'other'];
const TARGET_TYPES: ReportTargetType[] = ['message', 'user', 'room', 'image', 'video', 'dm'];

const createSchema = z.object({
  targetType: z.enum(TARGET_TYPES as [ReportTargetType, ...ReportTargetType[]]),
  targetId: z.string().min(1),
  reason: z.enum(REASONS as [ReportReason, ...ReportReason[]]),
  comment: z.string().trim().max(1000).optional(),
});

const resolveSchema = z.object({
  decision: z.enum(['accept', 'reject']),
  block: z.boolean().optional(),
  warn: z.boolean().optional(),
  note: z.string().trim().max(1000).optional(),
});

interface ResolvedTarget {
  targetUserId: string | null;
  targetLabel: string | null;
  snapshot: Record<string, unknown>;
}

/** Собирает снапшот цели жалобы и владельца-нарушителя. null — цель не найдена. */
async function resolveTarget(type: ReportTargetType, id: string): Promise<ResolvedTarget | null> {
  if (type === 'user') {
    const u = await prisma.user.findUnique({ where: { id }, select: { id: true, username: true, publicId: true } });
    if (!u) return null;
    return { targetUserId: u.id, targetLabel: u.username, snapshot: { username: u.username, publicId: u.publicId } };
  }
  if (type === 'room') {
    const r = await prisma.room.findUnique({ where: { id }, select: { slug: true, name: true, ownerId: true } });
    if (!r) return null;
    return { targetUserId: r.ownerId, targetLabel: r.name, snapshot: { slug: r.slug, name: r.name } };
  }
  if (type === 'message') {
    const m = await prisma.message.findUnique({
      where: { id },
      select: { body: true, userId: true, guestName: true, room: { select: { slug: true, name: true } }, user: { select: { username: true } } },
    });
    if (!m) return null;
    return {
      targetUserId: m.userId,
      targetLabel: m.user?.username ?? m.guestName ?? 'гость',
      snapshot: { body: m.body, roomSlug: m.room.slug, roomName: m.room.name, author: m.user?.username ?? null },
    };
  }
  // image | video | dm → ссылаются на DirectMessage
  const dm = await prisma.directMessage.findUnique({
    where: { id },
    select: { body: true, imageUrl: true, voiceUrl: true, videoUrl: true, conversationId: true, senderId: true, sender: { select: { username: true } } },
  });
  if (!dm) return null;
  return {
    targetUserId: dm.senderId,
    targetLabel: dm.sender?.username ?? '—',
    snapshot: {
      conversationId: dm.conversationId,
      body: dm.body,
      imageUrl: dm.imageUrl,
      voiceUrl: dm.voiceUrl,
      videoUrl: dm.videoUrl,
      sender: dm.sender?.username ?? null,
    },
  };
}

function toReportDTO(r: Report): ReportDTO {
  let snapshot: Record<string, unknown> = {};
  try {
    snapshot = JSON.parse(r.snapshotJson) as Record<string, unknown>;
  } catch { /* ignore */ }
  return {
    id: r.id,
    reporterId: r.reporterId,
    reporterName: r.reporterName,
    targetType: r.targetType as ReportTargetType,
    targetId: r.targetId,
    targetUserId: r.targetUserId,
    targetLabel: r.targetLabel,
    reason: r.reason as ReportReason,
    comment: r.comment,
    snapshot,
    status: r.status as ReportStatus,
    handledByEmail: r.handledByEmail,
    handledAt: r.handledAt ? r.handledAt.toISOString() : null,
    resolutionNote: r.resolutionNote,
    createdAt: r.createdAt.toISOString(),
  };
}

/** Пользовательский роут: подать жалобу. Доступен любому авторизованному. */
export async function reportPublicRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: CreateReportRequest }>('/reports', { preHandler: requireAuth }, async (req, reply) => {
    // Приём жалоб управляется feature-флагом. Когда выключен — жалобы недоступны
    // (клиент их и не показывает, но защищаемся и на сервере).
    if (!(await isFeatureEnabled(FEATURE_FLAG_REPORTS, true))) {
      reply.code(403).send({ error: 'Forbidden', message: 'Приём жалоб отключён', statusCode: 403 });
      return;
    }
    const body = createSchema.parse(req.body);
    const principal = req.principal!;
    const target = await resolveTarget(body.targetType, body.targetId);
    if (!target) {
      reply.code(404).send({ error: 'NotFound', message: 'Объект жалобы не найден', statusCode: 404 });
      return;
    }
    // Нельзя жаловаться на себя.
    if (target.targetUserId && target.targetUserId === principal.userId) {
      reply.code(400).send({ error: 'BadRequest', message: 'Нельзя пожаловаться на себя', statusCode: 400 });
      return;
    }
    // Дедуп: один открытый репорт от того же пользователя на ту же цель.
    const existing = await prisma.report.findFirst({
      where: { reporterId: principal.userId, targetType: body.targetType, targetId: body.targetId, status: { in: ['open', 'reviewing'] } },
      select: { id: true },
    });
    if (existing) {
      reply.send({ ok: true, deduped: true });
      return;
    }
    const reporterName = principal.kind === 'user'
      ? (await prisma.user.findUnique({ where: { id: principal.userId }, select: { username: true } }))?.username ?? null
      : principal.username;
    await prisma.report.create({
      data: {
        reporterId: principal.userId,
        reporterName,
        targetType: body.targetType,
        targetId: body.targetId,
        targetUserId: target.targetUserId,
        targetLabel: target.targetLabel,
        reason: body.reason,
        comment: body.comment ?? null,
        snapshotJson: JSON.stringify(target.snapshot),
      },
    });
    reply.send({ ok: true });
  });
}

/** Админ-роуты: очередь жалоб и решения по ним. */
export async function adminReportRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { status?: string; cursor?: string; limit?: string } }>(
    '/admin/reports',
    { preHandler: requirePermission('reports.view') },
    async (req, reply) => {
      const q = z.object({
        status: z.enum(['open', 'reviewing', 'accepted', 'rejected', 'all']).default('open'),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(30),
      }).parse(req.query);
      const where = q.status === 'all' ? {} : { status: q.status };
      const [rows, openCount] = await Promise.all([
        prisma.report.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: q.limit + 1,
          ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        }),
        prisma.report.count({ where: { status: 'open' } }),
      ]);
      const hasMore = rows.length > q.limit;
      const page = hasMore ? rows.slice(0, q.limit) : rows;
      reply.send({
        reports: page.map(toReportDTO),
        nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
        openCount,
      } satisfies ReportListResponse);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/admin/reports/:id/resolve',
    { preHandler: requirePermission('reports.handle') },
    async (req, reply) => {
      const body = resolveSchema.parse(req.body);
      const report = await prisma.report.findUnique({ where: { id: req.params.id } });
      if (!report) {
        reply.code(404).send({ error: 'NotFound', message: 'Жалоба не найдена', statusCode: 404 });
        return;
      }
      const adminId = req.principal!.userId;
      // Заблокировать администратора (через жалобу) может только Super Admin.
      if (
        body.decision === 'accept' && body.block && report.targetUserId && report.targetUserId !== adminId
        && !req.adminIdentity?.isSuperAdmin && (await userHasAdminRole(report.targetUserId))
      ) {
        reply.code(403).send({ error: 'Forbidden', message: 'Заблокировать администратора может только Super Admin', statusCode: 403 });
        return;
      }
      const adminEmail = (await prisma.user.findUnique({ where: { id: adminId }, select: { email: true } }))?.email ?? null;
      const status = body.decision === 'accept' ? 'accepted' : 'rejected';

      // Побочные действия только при принятии жалобы.
      let blocked = false;
      let warned = false;
      if (body.decision === 'accept' && report.targetUserId && report.targetUserId !== adminId) {
        if (body.block) {
          try { await blockUser(report.targetUserId, body.note || `Жалоба: ${report.reason}`); blocked = true; } catch (err) {
            logger.warn({ err: (err as Error).message }, 'report: block failed');
          }
        }
        if (body.warn) {
          warned = await broadcastNotify(report.targetUserId, 'system', {
            title: 'Предупреждение модерации',
            body: body.note || 'Ваш контент нарушил правила сообщества.',
            url: '/',
          }).catch(() => false);
        }
      }

      const updated = await prisma.report.update({
        where: { id: report.id },
        data: { status, handledById: adminId, handledByEmail: adminEmail, handledAt: new Date(), resolutionNote: body.note ?? null },
      });
      await writeAudit(req, 'report.resolve', { type: 'report', id: report.id, label: report.targetLabel }, {
        meta: { decision: body.decision, block: blocked, warn: warned, targetUserId: report.targetUserId },
      });
      reply.send({ report: toReportDTO(updated) });
    },
  );
}
