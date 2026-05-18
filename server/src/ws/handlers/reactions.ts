import type { C2SReaction } from '@vellin/shared';
import type { RoomRuntime } from '../../rooms/RoomRuntime.js';
import type { ConnectionContext } from '../connection.js';
import { sendError } from '../connection.js';

const ALLOWED = new Set(['❤️', '😂', '😮', '🔥', '👏', '🎉', '🥲', '👀']);

export function handleReaction(
  runtime: RoomRuntime,
  ctx: ConnectionContext,
  msg: C2SReaction,
): void {
  if (typeof msg.emoji !== 'string' || msg.emoji.length === 0 || msg.emoji.length > 8) {
    sendError(ctx, 'invalid_payload', 'Invalid emoji');
    return;
  }
  if (!ALLOWED.has(msg.emoji)) {
    sendError(ctx, 'invalid_payload', 'Emoji not allowed');
    return;
  }
  runtime.emitReaction(ctx.principal.userId, msg.emoji);
}
