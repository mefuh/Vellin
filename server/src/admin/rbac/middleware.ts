import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AdminPermission } from '@vellin/shared';
import { requireAuth } from '../../auth/middleware.js';
import { resolveAdminIdentity, type AdminIdentity } from './roles.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Резолвится requirePermission/requireAdminAccess — роль и права актора. */
    adminIdentity?: AdminIdentity;
  }
}

function deny(reply: FastifyReply, status: number, message: string): void {
  reply.code(status).send({ error: status === 403 ? 'Forbidden' : 'Unauthorized', message, statusCode: status });
}

/**
 * Базовый гейт админки: валидная сессия + непустая админ-роль. Кладёт
 * `req.adminIdentity`. Используется для роутов, доступных любому сотруднику
 * (например GET /admin/me). Для конкретных прав — requirePermission.
 */
export async function requireAdminAccess(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAuth(request, reply);
  if (reply.sent) return;
  const principal = request.principal;
  if (!principal || principal.kind !== 'user') {
    deny(reply, 403, 'Admin only');
    return;
  }
  const identity = await resolveAdminIdentity(principal.userId);
  if (!identity.role) {
    deny(reply, 403, 'Admin only');
    return;
  }
  request.adminIdentity = identity;
}

/**
 * preHandler-фабрика: требует конкретный пермишен. super_admin проходит всегда
 * (его набор = весь каталог). Возвращает 403 при нехватке прав. Клиентские
 * проверки — лишь UX; здесь настоящий барьер.
 */
export function requirePermission(permission: AdminPermission) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await requireAdminAccess(request, reply);
    if (reply.sent) return;
    const identity = request.adminIdentity!;
    if (!identity.permissions.includes(permission)) {
      deny(reply, 403, `Недостаточно прав: требуется ${permission}`);
    }
  };
}

/** true, если у актора запроса есть право (после requireAdminAccess). */
export function actorCan(request: FastifyRequest, permission: AdminPermission): boolean {
  return request.adminIdentity?.permissions.includes(permission) ?? false;
}
