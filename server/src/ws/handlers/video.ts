import type {
  C2SVideoPause,
  C2SVideoPlay,
  C2SVideoSeek,
  C2SVideoSetUrl,
} from '@vellin/shared';
import type { RoomRuntime } from '../../rooms/RoomRuntime.js';
import type { ConnectionContext } from '../connection.js';
import { sendError } from '../connection.js';
import { resolveWithCache } from '../../media/resolveWithCache.js';
import { ResolveError } from '../../media/Resolver.js';
import { logger } from '../../utils/logger.js';
import { logRoomEvent } from '../../rooms/events.js';

const URL_PATTERN = /^(https?:\/\/|magnet:).+/i;

export async function handleVideoEvent(
  runtime: RoomRuntime,
  ctx: ConnectionContext,
  msg: C2SVideoPlay | C2SVideoPause | C2SVideoSeek,
): Promise<void> {
  const userId = ctx.principal.userId;
  const needed = msg.t === 'video_seek' ? 'canSeek' : 'canPlayPause';

  if (!runtime.assertPermission(userId, needed)) {
    sendError(ctx, 'no_permission', 'You do not have permission for this action');
    return;
  }

  const positionSec =
    Number.isFinite(msg.positionSec) && msg.positionSec >= 0 ? msg.positionSec : 0;

  if (msg.t === 'video_play') {
    runtime.applyPlay(userId, positionSec);
  } else if (msg.t === 'video_pause') {
    runtime.applyPause(userId, positionSec);
  } else {
    runtime.applySeek(userId, positionSec, Boolean(msg.playing));
  }
  logRoomEvent(runtime.roomId, msg.t === 'video_play' ? 'play' : msg.t === 'video_pause' ? 'pause' : 'seek', {
    actorId: ctx.principal.kind === 'user' ? ctx.principal.userId : null,
    actorName: ctx.principal.username,
    data: { positionSec: Math.round(positionSec) },
  });
}

export async function handleSetVideoUrl(
  runtime: RoomRuntime,
  ctx: ConnectionContext,
  msg: C2SVideoSetUrl,
): Promise<void> {
  if (!runtime.assertPermission(ctx.principal.userId, 'canSetVideoUrl')) {
    sendError(ctx, 'no_permission', 'You cannot change the video');
    return;
  }
  if (typeof msg.url !== 'string' || !URL_PATTERN.test(msg.url) || msg.url.length > 2048) {
    sendError(ctx, 'invalid_payload', 'Invalid URL');
    return;
  }

  runtime.signalVideoLoading(ctx.principal.userId, true, { sourceUrl: msg.url });
  try {
    const resolved = await resolveWithCache(msg.url);
    await runtime.setVideoUrl(msg.url, ctx.principal.userId, true, null, resolved);
    logRoomEvent(runtime.roomId, 'media_change', {
      actorId: ctx.principal.kind === 'user' ? ctx.principal.userId : null,
      actorName: ctx.principal.username,
      data: { url: msg.url, title: resolved?.title ?? null },
    });
  } catch (err) {
    runtime.signalVideoLoading(ctx.principal.userId, false);
    const userMessage =
      err instanceof ResolveError ? err.userMessage : 'Could not resolve this media link';
    logger.warn({ err: (err as Error).message, url: msg.url }, 'video resolve failed');
    sendError(ctx, 'resolve_failed', userMessage);
  }
}
