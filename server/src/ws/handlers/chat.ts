import type { C2SChatMessage } from '@vellin/shared';
import type { RoomRuntime } from '../../rooms/RoomRuntime.js';
import type { ConnectionContext } from '../connection.js';
import { sendError } from '../connection.js';

export async function handleChatMessage(
  runtime: RoomRuntime,
  ctx: ConnectionContext,
  msg: C2SChatMessage,
): Promise<void> {
  if (typeof msg.body !== 'string' || msg.body.length === 0) {
    sendError(ctx, 'invalid_payload', 'Empty message');
    return;
  }
  if (msg.body.length > 2000) {
    sendError(ctx, 'invalid_payload', 'Message exceeds 2000 characters');
    return;
  }
  if (typeof msg.nonce !== 'string' || msg.nonce.length === 0 || msg.nonce.length > 64) {
    sendError(ctx, 'invalid_payload', 'Invalid nonce');
    return;
  }
  await runtime.appendChatMessage(ctx.principal.userId, msg.body, msg.nonce);
}
