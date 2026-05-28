import type { MediaKind, ResolvedMedia } from '@vellin/shared';
import type { PlayerEngine } from './PlayerEngine';
import { HtmlVideoEngine } from './HtmlVideoEngine';
import { HlsEngine } from './HlsEngine';
import { DashEngine } from './DashEngine';
import { DualStreamEngine } from './DualStreamEngine';
import { WebTorrentEngine } from './WebTorrentEngine';

/**
 * Build a PlayerEngine for the given resolved media. Caller is responsible
 * for owning the engine's lifetime (destroy on swap).
 *
 * Iframe-based providers (`*_embed`) are intentionally unsupported — the
 * server resolver should produce a direct/hls/dash stream or fail loudly.
 */
export function createEngine(
  resolved: ResolvedMedia,
  videoEl: HTMLVideoElement,
): PlayerEngine {
  switch (resolved.kind) {
    case 'direct':
      return new HtmlVideoEngine(videoEl);
    case 'hls':
      return new HlsEngine(videoEl);
    case 'dash':
      return new DashEngine(videoEl);
    case 'dual':
      return new DualStreamEngine(videoEl);
    case 'torrent':
      return new WebTorrentEngine(videoEl);
    case 'youtube_embed':
    case 'rutube_embed':
    case 'vimeo_embed':
    case 'vk_embed':
      throw new Error(
        `Iframe playback is disabled. Resolver returned kind=${resolved.kind} for ${resolved.sourceUrl}; expected a native stream.`,
      );
    default: {
      // Exhaustiveness check — adding a new MediaKind without updating this
      // switch becomes a compile error.
      const _exhaustive: never = resolved.kind;
      throw new Error(`Unknown media kind: ${_exhaustive as string}`);
    }
  }
}

/**
 * Human-readable label for the bottom-bar chip (e.g. "HLS", "Torrent").
 */
export function kindLabel(kind: MediaKind): string {
  switch (kind) {
    case 'direct':
      return 'Direct';
    case 'hls':
      return 'HLS';
    case 'dash':
      return 'DASH';
    case 'dual':
      return 'YouTube HD';
    case 'torrent':
      return 'Torrent';
    case 'youtube_embed':
    case 'rutube_embed':
    case 'vimeo_embed':
    case 'vk_embed':
      return 'Embed (disabled)';
    default:
      return kind;
  }
}
