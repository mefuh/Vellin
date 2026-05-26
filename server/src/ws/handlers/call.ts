import type {
  C2SCallJoin,
  C2SCallLeave,
  C2SCallMedia,
  C2SCallSignal,
  C2SCallSpeaking,
} from '@vellin/shared';
import type { ConnectionContext } from '../connection.js';
import type { RoomRuntime } from '../../rooms/RoomRuntime.js';
import { CallError } from '../../rooms/RoomRuntime.js';
import { logger } from '../../utils/logger.js';

function sendCallError(ctx: ConnectionContext, err: unknown): void {
  if (err instanceof CallError) {
    ctx.send({ t: 'call_error', code: err.code, message: err.message });
    return;
  }
  logger.warn({ err: (err as Error).message }, 'call: unexpected handler failure');
  ctx.send({ t: 'error', code: 'internal', message: 'Внутренняя ошибка звонка' });
}

/** Adds the caller to the room's call and broadcasts the new member. */
export function handleCallJoin(
  runtime: RoomRuntime,
  ctx: ConnectionContext,
  msg: C2SCallJoin,
): void {
  try {
    const member = runtime.joinCall(ctx.principal.userId, !!msg.wantVideo);
    // 1) ack the joiner with the full snapshot (includes themselves)
    ctx.send({ t: 'call_state', snapshot: runtime.snapshotCall(), serverTs: Date.now() });
    // 2) tell everyone else about the new member
    runtime.broadcast(
      { t: 'call_peer_joined', member, serverTs: Date.now() },
      ctx.principal.userId,
    );
  } catch (err) {
    sendCallError(ctx, err);
  }
}

/** Removes the caller from the call and notifies the room. */
export function handleCallLeave(
  runtime: RoomRuntime,
  ctx: ConnectionContext,
  _msg: C2SCallLeave,
): void {
  if (runtime.leaveCall(ctx.principal.userId)) {
    runtime.broadcast({
      t: 'call_peer_left',
      userId: ctx.principal.userId,
      serverTs: Date.now(),
    });
  }
}

/** Updates the caller's mic/camera state and broadcasts a media delta. */
export function handleCallMedia(
  runtime: RoomRuntime,
  ctx: ConnectionContext,
  msg: C2SCallMedia,
): void {
  try {
    const updated = runtime.setCallMedia(ctx.principal.userId, {
      audio: !!msg.audio,
      video: !!msg.video,
    });
    runtime.broadcast({
      t: 'call_peer_media',
      userId: updated.userId,
      audio: updated.audio,
      video: updated.video,
      serverTs: Date.now(),
    });
  } catch (err) {
    sendCallError(ctx, err);
  }
}

/**
 * Forwards a single WebRTC signaling message (SDP or ICE) from one peer to
 * another. The server never inspects payload content — it's opaque envelope.
 */
export function handleCallSignal(
  runtime: RoomRuntime,
  ctx: ConnectionContext,
  msg: C2SCallSignal,
): void {
  if (!runtime.callHas(ctx.principal.userId)) {
    ctx.send({ t: 'call_error', code: 'not_in_call', message: 'Вы не в звонке' });
    return;
  }
  if (typeof msg.toUserId !== 'string' || !msg.toUserId || msg.toUserId === ctx.principal.userId) {
    ctx.send({ t: 'call_error', code: 'invalid_target', message: 'Неверный получатель' });
    return;
  }
  const target = runtime.participants.get(msg.toUserId);
  if (!target || !runtime.callHas(msg.toUserId)) {
    ctx.send({ t: 'call_error', code: 'invalid_target', message: 'Собеседник не в звонке' });
    return;
  }
  target.session.send({
    t: 'call_signal_relay',
    fromUserId: ctx.principal.userId,
    payload: msg.payload,
    serverTs: Date.now(),
  });
}

/**
 * Broadcasts the caller's speaking state (on/off) to every other call
 * member. No mutex / no persistence — transient indicator updated on
 * transition only (start ↔ stop) by the client's local RMS analyser.
 */
export function handleCallSpeaking(
  runtime: RoomRuntime,
  ctx: ConnectionContext,
  msg: C2SCallSpeaking,
): void {
  if (!runtime.callHas(ctx.principal.userId)) return;
  runtime.broadcast(
    {
      t: 'call_peer_speaking',
      userId: ctx.principal.userId,
      speaking: !!msg.speaking,
      serverTs: Date.now(),
    },
    ctx.principal.userId,
  );
}
