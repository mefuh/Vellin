import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Principal } from './jwt.js';
import { isWsTicket } from './jwt.js';
import { prisma } from '../db/prisma.js';
import { isAdminEmail } from '../env.js';
import { touchSession } from './sessions.js';

declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal;
  }
}

function deny(reply: FastifyReply, status: number, error: string, message: string): void {
  reply.code(status).send({ error, message, statusCode: status });
}

/**
 * Базовая аутентификация. Принимает только обычный session-JWT (не WS-ticket).
 * Для зарегистрированных пользователей дополнительно проверяет, что аккаунт
 * не заблокирован.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  let payload: Principal | { ticket: true };
  try {
    payload = await request.jwtVerify<Principal | { ticket: true }>();
  } catch {
    deny(reply, 401, 'Unauthorized', 'Invalid or missing token');
    return;
  }
  if (isWsTicket(payload as never)) {
    deny(reply, 401, 'Unauthorized', 'WS ticket not allowed for REST');
    return;
  }
  const principal = payload as Principal;
  if (principal.kind === 'user') {
    if (principal.sid) {
      // Токены с управлением устройствами: сессия должна быть жива. Одним
      // запросом проверяем и существование сессии, и блокировку аккаунта.
      const session = await prisma.session.findUnique({
        where: { id: principal.sid },
        select: { id: true, user: { select: { isBlocked: true } } },
      });
      if (!session) {
        deny(reply, 401, 'Unauthorized', 'Session revoked');
        return;
      }
      if (session.user.isBlocked) {
        deny(reply, 403, 'Forbidden', 'Ваш аккаунт заблокирован');
        return;
      }
      touchSession(principal.sid);
    } else {
      // Легаси-токены без sid: в списке устройств не светятся и индивидуально
      // не отзываются, но остаются валидными до перелогина.
      const user = await prisma.user.findUnique({
        where: { id: principal.userId },
        select: { isBlocked: true },
      });
      if (!user) {
        deny(reply, 401, 'Unauthorized', 'User no longer exists');
        return;
      }
      if (user.isBlocked) {
        deny(reply, 403, 'Forbidden', 'Ваш аккаунт заблокирован');
        return;
      }
    }
  }
  request.principal = principal;
}

/**
 * Доступ к админ-эндпоинтам. Главный админ — единственный пользователь, чей
 * email совпадает с ADMIN_EMAIL из окружения. Проверка идёт по свежему email
 * из БД, а не по claim'у в JWT (чтобы смена ADMIN_EMAIL мгновенно блокировала
 * старого админа без перевыпуска токенов).
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAuth(request, reply);
  if (reply.sent) return;
  const principal = request.principal;
  if (!principal || principal.kind !== 'user') {
    deny(reply, 403, 'Forbidden', 'Admin only');
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: principal.userId },
    select: { email: true },
  });
  if (!user || !isAdminEmail(user.email)) {
    deny(reply, 403, 'Forbidden', 'Admin only');
    return;
  }
}
