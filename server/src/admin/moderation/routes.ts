import type { FastifyInstance } from 'fastify';
import type { AdminUserFullResponse, AdminUserSessionsResponse } from '@vellin/shared';
import { prisma } from '../../db/prisma.js';
import { requirePermission } from '../rbac/middleware.js';
import { writeAudit } from '../audit/audit.js';
import {
  disableUserPush,
  getUserFull,
  listUserSessions,
  resetUserAvatar,
  resetUserBio,
  resetUserFavorites,
  revokeAllUserSessions,
  revokeUserSession,
} from './users.js';

async function usernameOf(id: string): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { id }, select: { username: true } });
  return u?.username ?? null;
}

function notFound(reply: import('fastify').FastifyReply, message = 'Пользователь не найден'): void {
  reply.code(404).send({ error: 'NotFound', message, statusCode: 404 });
}

/**
 * Модерация пользователей: агрегированный профиль-360 и точечные действия
 * (сессии, push, сброс полей). Просмотр — за users.view, любые изменения — за
 * users.moderate, каждое пишет запись в Audit Log.
 */
export async function adminModerationRoutes(app: FastifyInstance): Promise<void> {
  // ── Профиль-360 ────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/admin/users/:id/full',
    { preHandler: requirePermission('users.view') },
    async (req, reply) => {
      const full = await getUserFull(req.params.id);
      if (!full) return notFound(reply);
      reply.send(full satisfies AdminUserFullResponse);
    },
  );

  // ── Сессии / устройства ───────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/admin/users/:id/sessions',
    { preHandler: requirePermission('users.view') },
    async (req, reply) => {
      const sessions = await listUserSessions(req.params.id);
      reply.send({ sessions } satisfies AdminUserSessionsResponse);
    },
  );

  app.delete<{ Params: { id: string; sid: string } }>(
    '/admin/users/:id/sessions/:sid',
    { preHandler: requirePermission('users.moderate') },
    async (req, reply) => {
      const ok = await revokeUserSession(req.params.id, req.params.sid);
      if (!ok) return notFound(reply, 'Сессия не найдена');
      await writeAudit(req, 'user.session_revoke', {
        type: 'user',
        id: req.params.id,
        label: await usernameOf(req.params.id),
      }, { meta: { sessionId: req.params.sid } });
      reply.code(204).send();
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/admin/users/:id/sessions',
    { preHandler: requirePermission('users.moderate') },
    async (req, reply) => {
      const count = await revokeAllUserSessions(req.params.id);
      await writeAudit(req, 'user.sessions_revoke_all', {
        type: 'user',
        id: req.params.id,
        label: await usernameOf(req.params.id),
      }, { meta: { count } });
      reply.send({ count });
    },
  );

  // ── Push ────────────────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/admin/users/:id/push/disable',
    { preHandler: requirePermission('users.moderate') },
    async (req, reply) => {
      const name = await usernameOf(req.params.id);
      if (name === null && !(await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true } }))) {
        return notFound(reply);
      }
      await disableUserPush(req.params.id);
      await writeAudit(req, 'user.push_disable', { type: 'user', id: req.params.id, label: name });
      reply.code(204).send();
    },
  );

  // ── Сброс полей профиля ───────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/admin/users/:id/reset-avatar',
    { preHandler: requirePermission('users.moderate') },
    async (req, reply) => {
      await resetUserAvatar(req.params.id);
      await writeAudit(req, 'user.reset_avatar', { type: 'user', id: req.params.id, label: await usernameOf(req.params.id) });
      reply.code(204).send();
    },
  );

  app.post<{ Params: { id: string } }>(
    '/admin/users/:id/reset-bio',
    { preHandler: requirePermission('users.moderate') },
    async (req, reply) => {
      await resetUserBio(req.params.id);
      await writeAudit(req, 'user.reset_bio', { type: 'user', id: req.params.id, label: await usernameOf(req.params.id) });
      reply.code(204).send();
    },
  );

  app.post<{ Params: { id: string } }>(
    '/admin/users/:id/reset-favorites',
    { preHandler: requirePermission('users.moderate') },
    async (req, reply) => {
      const count = await resetUserFavorites(req.params.id);
      await writeAudit(req, 'user.reset_favorites', { type: 'user', id: req.params.id, label: await usernameOf(req.params.id) }, { meta: { count } });
      reply.send({ count });
    },
  );
}
