import type { MediaKind, ResolvedMedia } from '@vellin/shared';
import type { PlayerEngine } from './PlayerEngine';
import { HtmlVideoEngine } from './HtmlVideoEngine';
import { HlsEngine } from './HlsEngine';
import { DashEngine } from './DashEngine';
import { DualStreamEngine } from './DualStreamEngine';
import { WebTorrentEngine } from './WebTorrentEngine';
import { YouTubeIframeEngine } from './YouTubeIframeEngine';

/**
 * Build a PlayerEngine for the given resolved media. Caller is responsible
 * for owning the engine's lifetime (destroy on swap).
 *
 * `youtube_embed` — запасной путь (iframe-плеер YouTube), когда извлечение
 * прямого потока невозможно или упало в браузере. Прочие `*_embed` пока не
 * поддерживаются — резолвер должен дать нативный поток.
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
      return new YouTubeIframeEngine(videoEl);
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
      return 'YouTube';
    case 'rutube_embed':
    case 'vimeo_embed':
    case 'vk_embed':
      return 'Embed (disabled)';
    default:
      return kind;
  }
}
