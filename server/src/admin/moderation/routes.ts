import type { FastifyInstance } from 'fastify';
import type {
  AdminFavoritesReorderRequest,
  AdminFavoritesResponse,
  AdminSharedTimeAdjustRequest,
  AdminSharedTimeResponse,
  AdminUpdateUserProfileResponse,
  AdminUserFullResponse,
  AdminUserProfilePatch,
  AdminUserSessionsResponse,
} from '@vellin/shared';
import { prisma } from '../../db/prisma.js';
import { requirePermission } from '../rbac/middleware.js';
import { writeAudit } from '../audit/audit.js';
import { removeFavorite, reorderFavorites } from '../../titles/service.js';
import { adjustSharedWatch, resetSharedWatch } from '../../social/sharedTime.js';
import {
  disableUserPush,
  getUserFull,
  listUserSessions,
  resetUserAvatar,
  resetUserBio,
  resetUserFavorites,
  revokeAllUserSessions,
  revokeUserSession,
  updateUserProfile,
} from './users.js';

const EMAIL_ERROR: Record<string, string> = {
  email_invalid: 'Некорректный email',
  email_taken: 'Email уже занят другим пользователем',
  birthDate_invalid: 'Некорректная дата рождения',
};

function toFavoriteDTO(f: { kpId: number; title: string; year: number | null; posterUrl: string | null; ratingKp: number | null }) {
  return { kpId: f.kpId, title: f.title, year: f.year, posterUrl: f.posterUrl, ratingKp: f.ratingKp };
}

async function usernameOf(id: string): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { id }, select: { username: true } });
  return u?.username ?? null;
}

function notFound(reply: import('fastify').FastifyReply, message = 'Пользователь не найден'): void {
  reply.code(404).send({ error: 'NotFound', message, statusCode: 404 });
}

function badRequest(reply: import('fastify').FastifyReply, message: string): void {
  reply.code(400).send({ error: 'BadRequest', message, statusCode: 400 });
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

  // ── Редактирование полей профиля (email / город / пол / дата рождения) ────
  app.patch<{ Params: { id: string }; Body: AdminUserProfilePatch }>(
    '/admin/users/:id/profile',
    { preHandler: requirePermission('users.moderate') },
    async (req, reply) => {
      const before = await prisma.user.findUnique({
        where: { id: req.params.id },
        select: { email: true, city: true, gender: true, birthDate: true },
      });
      const res = await updateUserProfile(req.params.id, req.body ?? {});
      if (!res.ok) {
        if (res.reason === 'not_found') return notFound(reply);
        return badRequest(reply, EMAIL_ERROR[res.reason] ?? 'Некорректные данные');
      }
      await writeAudit(req, 'user.edit_profile', { type: 'user', id: req.params.id, label: res.user.username }, {
        before: before
          ? { email: before.email, city: before.city, gender: before.gender, birthDate: before.birthDate ? before.birthDate.toISOString().slice(0, 10) : null }
          : {},
        after: { email: res.user.email, city: res.user.city, gender: res.user.gender, birthDate: res.user.birthDate },
      });
      reply.send({ user: res.user } satisfies AdminUpdateUserProfileResponse);
    },
  );

  // ── Избранное: точечное удаление и переупорядочивание ─────────────────────
  app.delete<{ Params: { id: string; kpId: string } }>(
    '/admin/users/:id/favorites/:kpId',
    { preHandler: requirePermission('users.moderate') },
    async (req, reply) => {
      const kpId = Number(req.params.kpId);
      if (!Number.isInteger(kpId)) return badRequest(reply, 'Некорректный id фильма');
      const favorites = await removeFavorite(req.params.id, kpId);
      await writeAudit(req, 'user.favorite_remove', { type: 'user', id: req.params.id, label: await usernameOf(req.params.id) }, { meta: { kpId } });
      reply.send({ favorites: favorites.map(toFavoriteDTO) } satisfies AdminFavoritesResponse);
    },
  );

  app.post<{ Params: { id: string }; Body: AdminFavoritesReorderRequest }>(
    '/admin/users/:id/favorites/reorder',
    { preHandler: requirePermission('users.moderate') },
    async (req, reply) => {
      const order = Array.isArray(req.body?.order) ? req.body.order.map(Number).filter(Number.isInteger) : [];
      const favorites = await reorderFavorites(req.params.id, order);
      await writeAudit(req, 'user.favorites_reorder', { type: 'user', id: req.params.id, label: await usernameOf(req.params.id) });
      reply.send({ favorites: favorites.map(toFavoriteDTO) } satisfies AdminFavoritesResponse);
    },
  );

  // ── Совместное время: начисление/списание и аннулирование ─────────────────
  app.post<{ Params: { id: string; peerId: string }; Body: AdminSharedTimeAdjustRequest }>(
    '/admin/users/:id/shared-time/:peerId/adjust',
    { preHandler: requirePermission('users.moderate') },
    async (req, reply) => {
      const delta = Number(req.body?.deltaSeconds);
      if (!Number.isFinite(delta) || delta === 0) return badRequest(reply, 'Укажите ненулевую величину');
      const [user, peer] = await Promise.all([
        prisma.user.findUnique({ where: { id: req.params.id }, select: { username: true } }),
        prisma.user.findUnique({ where: { id: req.params.peerId }, select: { username: true } }),
      ]);
      if (!user || !peer) return notFound(reply);
      const agg = await adjustSharedWatch(req.params.id, req.params.peerId, delta);
      await writeAudit(req, 'user.shared_time_adjust', { type: 'user', id: req.params.id, label: user.username }, {
        meta: { peerId: req.params.peerId, peerName: peer.username, deltaSeconds: Math.round(delta), totalSeconds: agg.totalSeconds },
      });
      reply.send({ totalSeconds: agg.totalSeconds, sessionsCount: agg.sessionsCount, longestSessionSeconds: agg.longestSessionSeconds } satisfies AdminSharedTimeResponse);
    },
  );

  app.delete<{ Params: { id: string; peerId: string } }>(
    '/admin/users/:id/shared-time/:peerId',
    { preHandler: requirePermission('users.moderate') },
    async (req, reply) => {
      const [user, peer] = await Promise.all([
        prisma.user.findUnique({ where: { id: req.params.id }, select: { username: true } }),
        prisma.user.findUnique({ where: { id: req.params.peerId }, select: { username: true } }),
      ]);
      if (!user || !peer) return notFound(reply);
      await resetSharedWatch(req.params.id, req.params.peerId);
      await writeAudit(req, 'user.shared_time_reset', { type: 'user', id: req.params.id, label: user.username }, {
        meta: { peerId: req.params.peerId, peerName: peer.username },
      });
      reply.code(204).send();
    },
  );
}
