import type { FastifyInstance } from 'fastify';

export type Principal =
  | {
      kind: 'user';
      userId: string;
      username: string;
      avatarSeed: string;
      /** URL загруженного аватара (или null/undefined — рисуем градиент). */
      avatarUrl?: string | null;
      /**
       * Id серверной сессии (Session.id). Есть у токенов, выданных после
       * внедрения управления устройствами. Старые токены его не имеют —
       * requireAuth обрабатывает оба случая.
       */
      sid?: string;
    }
  | { kind: 'guest'; userId: string; username: string; avatarSeed: string };

export interface WsTicketPayload {
  ticket: true;
  roomId: string;
  principal: Principal;
  /**
   * Маркер, что тикет выдан админом из админ-панели. WS-handshake пропустит
   * приватность/пароль/capacity, а роль в RoomRuntime будет 'superadmin'.
   */
  admin?: boolean;
  /**
   * Подрежим админа: shadow-сессия видит всё, но НЕ светится в списке
   * участников и не может ничего изменить. Имеет смысл только при admin=true.
   */
  shadow?: boolean;
}

/**
 * Тикет для пользовательского realtime-канала `/ws/user` — короткоживущий,
 * без привязки к комнате. Отличается от комнатного полем `user: true`.
 */
export interface UserTicketPayload {
  ticket: true;
  user: true;
  principal: Principal;
}

export type JwtPayload =
  | (Principal & { ticket?: false })
  | WsTicketPayload
  | UserTicketPayload;

export function signSession(app: FastifyInstance, principal: Principal): string {
  return app.jwt.sign(principal, { expiresIn: '30d' });
}

export function signWsTicket(
  app: FastifyInstance,
  roomId: string,
  principal: Principal,
  ttlSec: number,
  opts: { admin?: boolean; shadow?: boolean } = {},
): string {
  const payload: WsTicketPayload = {
    ticket: true,
    roomId,
    principal,
    ...(opts.admin ? { admin: true } : {}),
    ...(opts.shadow ? { shadow: true } : {}),
  };
  return app.jwt.sign(payload, { expiresIn: `${ttlSec}s` });
}

/** Тикет для пользовательского realtime-канала. */
export function signUserTicket(app: FastifyInstance, principal: Principal, ttlSec: number): string {
  const payload: UserTicketPayload = { ticket: true, user: true, principal };
  return app.jwt.sign(payload, { expiresIn: `${ttlSec}s` });
}

export function verifyToken(app: FastifyInstance, token: string): JwtPayload {
  return app.jwt.verify<JwtPayload>(token);
}

/** Любой тикет (комнатный или пользовательский) — не годится для REST. */
export function isWsTicket(payload: JwtPayload): payload is WsTicketPayload | UserTicketPayload {
  return (payload as { ticket?: unknown }).ticket === true;
}

/** Именно пользовательский realtime-тикет (есть `user: true`). */
export function isUserTicket(payload: unknown): payload is UserTicketPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    (payload as { ticket?: unknown }).ticket === true &&
    (payload as { user?: unknown }).user === true
  );
}

/** avatarUrl принципала: есть только у зарегистрированных пользователей. */
export function principalAvatarUrl(p: Principal): string | null {
  return p.kind === 'user' ? p.avatarUrl ?? null : null;
}
