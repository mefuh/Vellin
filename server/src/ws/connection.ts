import type { WebSocket } from 'ws';
import type { S2C } from '@vellin/shared';
import type { Principal } from '../auth/jwt.js';
import type { Session } from '../rooms/RoomRuntime.js';

export interface ConnectionContext extends Session {
  socket: WebSocket;
  roomId: string;
  bucket: { consume: (cost?: number) => boolean };
}

export function makeSession(
  socket: WebSocket,
  principal: Principal,
  roomId: string,
  sessionId: string,
): Omit<ConnectionContext, 'bucket'> {
  return {
    sessionId,
    principal,
    socket,
    roomId,
    send(msg: S2C) {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(msg));
      }
    },
    close(code: number, reason: string) {
      try {
        socket.close(code, reason);
      } catch {
        /* ignore */
      }
    },
    isOpen() {
      return socket.readyState === socket.OPEN;
    },
  };
}

export function sendError(
  session: Pick<Session, 'send'>,
  code:
    | 'rate_limited'
    | 'no_permission'
    | 'invalid_payload'
    | 'room_full'
    | 'auth_expired'
    | 'internal'
    | 'duplicate_session'
    | 'resolve_failed',
  message: string,
): void {
  session.send({ t: 'error', code, message });
}
