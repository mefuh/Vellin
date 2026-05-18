import type { FastifyInstance } from 'fastify';

export type Principal =
  | { kind: 'user'; userId: string; username: string; avatarSeed: string }
  | { kind: 'guest'; userId: string; username: string; avatarSeed: string };

export interface WsTicketPayload {
  ticket: true;
  roomId: string;
  principal: Principal;
}

export type JwtPayload =
  | (Principal & { ticket?: false })
  | WsTicketPayload;

export function signSession(app: FastifyInstance, principal: Principal): string {
  return app.jwt.sign(principal, { expiresIn: '30d' });
}

export function signWsTicket(
  app: FastifyInstance,
  roomId: string,
  principal: Principal,
  ttlSec: number,
): string {
  const payload: WsTicketPayload = { ticket: true, roomId, principal };
  return app.jwt.sign(payload, { expiresIn: `${ttlSec}s` });
}

export function verifyToken(app: FastifyInstance, token: string): JwtPayload {
  return app.jwt.verify<JwtPayload>(token);
}

export function isWsTicket(payload: JwtPayload): payload is WsTicketPayload {
  return (payload as WsTicketPayload).ticket === true;
}
