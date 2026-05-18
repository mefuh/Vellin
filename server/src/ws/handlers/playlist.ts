import type {
  C2SPlaylistAdd,
  C2SPlaylistPlay,
  C2SPlaylistPrev,
  C2SPlaylistRemove,
  C2SPlaylistReorder,
  C2SVideoEnded,
} from '@vellin/shared';
import type { RoomRuntime } from '../../rooms/RoomRuntime.js';
import type { ConnectionContext } from '../connection.js';
import { sendError } from '../connection.js';
import { resolveWithCache } from '../../media/resolveWithCache.js';
import { ResolveError } from '../../media/Resolver.js';
import { logger } from '../../utils/logger.js';

const URL_PATTERN = /^(https?:\/\/|magnet:).+/i;
const MAX_TITLE_LEN = 200;

/**
 * Resolve helper for playlist transitions. On failure, logs and reports the
 * error to the requesting client (if any) but does NOT throw — the room
 * keeps its current video and the user can try again.
 */
async function resolveOrReport(
  ctx: ConnectionContext | null,
  url: string,
): Promise<ReturnType<typeof resolveWithCache> | null> {
  try {
    return await resolveWithCache(url);
  } catch (err) {
    const msg = err instanceof ResolveError ? err.userMessage : 'Could not resolve next video';
    logger.warn({ err: (err as Error).message, url }, 'playlist resolve failed');
    if (ctx) sendError(ctx, 'resolve_failed', msg);
    return null;
  }
}

export async function handlePlaylistAdd(
  runtime: RoomRuntime,
  ctx: ConnectionContext,
  msg: C2SPlaylistAdd,
): Promise<void> {
  if (!runtime.assertPermission(ctx.principal.userId, 'canManagePlaylist')) {
    sendError(ctx, 'no_permission', 'You cannot manage the playlist');
    return;
  }
  if (typeof msg.url !== 'string' || !URL_PATTERN.test(msg.url) || msg.url.length > 2048) {
    sendError(ctx, 'invalid_payload', 'Invalid URL');
    return;
  }
  const title =
    typeof msg.title === 'string' && msg.title.trim().length > 0
      ? msg.title.trim().slice(0, MAX_TITLE_LEN)
      : undefined;
  const added = runtime.addPlaylistItem(ctx.principal.userId, msg.url, title);
  if (!added) {
    sendError(ctx, 'invalid_payload', 'Playlist is full');
    return;
  }
  // Fire-and-forget title backfill: resolve the URL so the playlist item gets
  // its canonical name (e.g. yt-dlp returns the YouTube/Vimeo video title).
  // Skipped when the caller supplied a title — manual entries always win.
  if (!title) {
    void resolveWithCache(msg.url)
      .then((resolved) => {
        if (resolved.title) {
          runtime.updatePlaylistItemTitle(added.id, resolved.title);
        }
      })
      .catch(() => {
        // Title backfill is best-effort — silently drop failures.
      });
  }
}

export async function handlePlaylistRemove(
  runtime: RoomRuntime,
  ctx: ConnectionContext,
  msg: C2SPlaylistRemove,
): Promise<void> {
  if (!runtime.assertPermission(ctx.principal.userId, 'canManagePlaylist')) {
    sendError(ctx, 'no_permission', 'You cannot manage the playlist');
    return;
  }
  if (typeof msg.itemId !== 'string') {
    sendError(ctx, 'invalid_payload', 'Invalid item id');
    return;
  }
  runtime.removePlaylistItem(ctx.principal.userId, msg.itemId);
}

export async function handlePlaylistReorder(
  runtime: RoomRuntime,
  ctx: ConnectionContext,
  msg: C2SPlaylistReorder,
): Promise<void> {
  if (!runtime.assertPermission(ctx.principal.userId, 'canManagePlaylist')) {
    sendError(ctx, 'no_permission', 'You cannot manage the playlist');
    return;
  }
  if (!Array.isArray(msg.itemIds) || msg.itemIds.some((id) => typeof id !== 'string')) {
    sendError(ctx, 'invalid_payload', 'Invalid item ids');
    return;
  }
  const ok = runtime.reorderPlaylist(ctx.principal.userId, msg.itemIds);
  if (!ok) {
    sendError(ctx, 'invalid_payload', 'Reorder must include every current item');
  }
}

/**
 * Called when a client reports the current video ended. Idempotent: if the
 * playlist is empty OR the current URL no longer matches `msg.currentUrl`
 * (race with someone else's set_url or another ended signal), this is a no-op.
 */
export async function handleVideoEnded(
  runtime: RoomRuntime,
  ctx: ConnectionContext,
  msg: C2SVideoEnded,
): Promise<void> {
  if (typeof msg.currentUrl !== 'string') return;
  const next = runtime.popNextOnEnded(msg.currentUrl);
  if (!next) return;
  const resolved = await resolveOrReport(ctx, next.url);
  if (!resolved) return;
  await runtime.setVideoUrl(next.url, ctx.principal.userId, true, next.title ?? null, resolved);
  // Try to auto-play; if the reporting user lacks canPlayPause, the video
  // will stay paused on the new URL and someone with the right will need to
  // press play. This is a soft fallback — practically the leader has the
  // right (see VideoPlayer.tsx leader logic).
  runtime.applyPlay(ctx.principal.userId, 0);
}

/**
 * Manual jump: play a specific playlist item right now. Removes it from the
 * queue. Requires canManagePlaylist (skipping is queue management).
 */
export async function handlePlaylistPlay(
  runtime: RoomRuntime,
  ctx: ConnectionContext,
  msg: C2SPlaylistPlay,
): Promise<void> {
  if (!runtime.assertPermission(ctx.principal.userId, 'canManagePlaylist')) {
    sendError(ctx, 'no_permission', 'You cannot manage the playlist');
    return;
  }
  if (typeof msg.itemId !== 'string') {
    sendError(ctx, 'invalid_payload', 'Invalid item id');
    return;
  }
  const item = runtime.takePlaylistItem(msg.itemId);
  if (!item) return; // already gone (raced with remove or another play)
  const resolved = await resolveOrReport(ctx, item.url);
  if (!resolved) return;
  await runtime.setVideoUrl(item.url, ctx.principal.userId, true, item.title ?? null, resolved);
  runtime.applyPlay(ctx.principal.userId, 0);
}

/**
 * Jump back to the previously played video. No-op if history is empty.
 * We do NOT push current onto history here — otherwise consecutive prev clicks
 * would toggle between the two newest entries instead of stepping back.
 */
export async function handlePlaylistPrev(
  runtime: RoomRuntime,
  ctx: ConnectionContext,
  _msg: C2SPlaylistPrev,
): Promise<void> {
  if (!runtime.assertPermission(ctx.principal.userId, 'canManagePlaylist')) {
    sendError(ctx, 'no_permission', 'You cannot manage the playlist');
    return;
  }
  const prev = runtime.takePrevious();
  if (!prev) return;
  const resolved = await resolveOrReport(ctx, prev.url);
  if (!resolved) return;
  await runtime.setVideoUrl(prev.url, ctx.principal.userId, false, prev.title ?? null, resolved);
  runtime.applyPlay(ctx.principal.userId, 0);
}
