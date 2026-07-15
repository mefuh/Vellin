import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  AnnouncementListResponse,
  FeatureFlagListResponse,
  PlatformSettingsResponse,
  UpsertAnnouncementRequest,
} from '@vellin/shared';
import { requirePermission } from '../rbac/middleware.js';
import { writeAudit } from '../audit/audit.js';
import { getSettings, updateSettings } from './config.js';
import { deleteFlag, listFlags, upsertFlag } from './flags.js';
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  updateAnnouncement,
} from './announcements.js';

const settingsSchema = z.object({
  toggles: z.object({
    registration: z.boolean().optional(),
    guests: z.boolean().optional(),
    roomCreation: z.boolean().optional(),
    uploads: z.boolean().optional(),
  }).optional(),
  maintenance: z.object({
    enabled: z.boolean().optional(),
    message: z.string().max(500).optional(),
  }).optional(),
  limits: z.object({
    maxRoomParticipants: z.number().int().min(2).max(200).optional(),
    avatarMaxMb: z.number().int().min(1).max(50).optional(),
    dmImageMaxMb: z.number().int().min(1).max(100).optional(),
    dmVoiceMaxMb: z.number().int().min(1).max(100).optional(),
    dmVideoMaxMb: z.number().int().min(1).max(512).optional(),
  }).optional(),
}).refine((p) => Object.keys(p).length > 0, { message: 'Нужна хотя бы одна секция' });

const flagSchema = z.object({
  key: z.string().trim().min(1).max(80).regex(/^[a-z0-9._-]+$/i, 'Только буквы, цифры, . _ -'),
  enabled: z.boolean(),
  description: z.union([z.string().max(300), z.null()]).optional(),
});

const announcementSchema = z.object({
  kind: z.enum(['banner', 'modal', 'news']),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(2000),
  ctaLabel: z.union([z.string().max(60), z.null()]).optional(),
  ctaUrl: z.union([z.string().max(512), z.null()]).optional(),
  style: z.enum(['info', 'accent', 'warn']).optional(),
  audience: z.object({
    kind: z.enum(['all', 'role', 'new-users']),
    role: z.string().max(60).optional(),
  }).optional(),
  active: z.boolean().optional(),
  startsAt: z.union([z.string().datetime(), z.null()]).optional(),
  endsAt: z.union([z.string().datetime(), z.null()]).optional(),
}) satisfies z.ZodType<UpsertAnnouncementRequest>;

/** Админ-роуты управления платформой: настройки, feature flags, объявления. */
export async function adminPlatformRoutes(app: FastifyInstance): Promise<void> {
  // ── Настройки ──────────────────────────────────────────────────────────
  app.get('/admin/platform/settings', { preHandler: requirePermission('platform.manage') }, async (_req, reply) => {
    reply.send({ settings: await getSettings() } satisfies PlatformSettingsResponse);
  });

  app.put('/admin/platform/settings', { preHandler: requirePermission('platform.manage') }, async (req, reply) => {
    const patch = settingsSchema.parse(req.body);
    const before = await getSettings();
    const settings = await updateSettings(patch, req.principal!.userId);
    await writeAudit(req, 'platform.update', { type: 'config', label: 'platform.settings' }, { before, after: settings });
    reply.send({ settings } satisfies PlatformSettingsResponse);
  });

  // ── Feature flags ──────────────────────────────────────────────────────
  app.get('/admin/platform/flags', { preHandler: requirePermission('flags.manage') }, async (_req, reply) => {
    reply.send({ flags: await listFlags() } satisfies FeatureFlagListResponse);
  });

  app.put('/admin/platform/flags', { preHandler: requirePermission('flags.manage') }, async (req, reply) => {
    const body = flagSchema.parse(req.body);
    const flag = await upsertFlag(body.key, body.enabled, body.description, req.principal!.userId);
    await writeAudit(req, 'flag.update', { type: 'flag', id: body.key, label: body.key }, { after: { enabled: body.enabled } });
    reply.send({ flag });
  });

  app.delete<{ Params: { key: string } }>('/admin/platform/flags/:key', { preHandler: requirePermission('flags.manage') }, async (req, reply) => {
    const ok = await deleteFlag(req.params.key);
    if (!ok) {
      reply.code(404).send({ error: 'NotFound', message: 'Флаг не найден', statusCode: 404 });
      return;
    }
    await writeAudit(req, 'flag.update', { type: 'flag', id: req.params.key, label: req.params.key }, { meta: { deleted: true } });
    reply.code(204).send();
  });

  // ── Объявления ─────────────────────────────────────────────────────────
  app.get('/admin/platform/announcements', { preHandler: requirePermission('announcements.manage') }, async (_req, reply) => {
    reply.send({ announcements: await listAnnouncements() } satisfies AnnouncementListResponse);
  });

  app.post('/admin/platform/announcements', { preHandler: requirePermission('announcements.manage') }, async (req, reply) => {
    const body = announcementSchema.parse(req.body);
    const ann = await createAnnouncement(body, req.principal!.userId);
    await writeAudit(req, 'announcement.update', { type: 'announcement', id: ann.id, label: ann.title }, { after: { active: ann.active, kind: ann.kind } });
    reply.send({ announcement: ann });
  });

  app.patch<{ Params: { id: string } }>('/admin/platform/announcements/:id', { preHandler: requirePermission('announcements.manage') }, async (req, reply) => {
    const body = announcementSchema.parse(req.body);
    const ann = await updateAnnouncement(req.params.id, body);
    if (!ann) {
      reply.code(404).send({ error: 'NotFound', message: 'Объявление не найдено', statusCode: 404 });
      return;
    }
    await writeAudit(req, 'announcement.update', { type: 'announcement', id: ann.id, label: ann.title }, { after: { active: ann.active } });
    reply.send({ announcement: ann });
  });

  app.delete<{ Params: { id: string } }>('/admin/platform/announcements/:id', { preHandler: requirePermission('announcements.manage') }, async (req, reply) => {
    const ok = await deleteAnnouncement(req.params.id);
    if (!ok) {
      reply.code(404).send({ error: 'NotFound', message: 'Объявление не найдено', statusCode: 404 });
      return;
    }
    await writeAudit(req, 'announcement.update', { type: 'announcement', id: req.params.id }, { meta: { deleted: true } });
    reply.code(204).send();
  });
}
