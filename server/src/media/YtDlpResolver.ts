import { spawn } from 'node:child_process';
import type { MediaKind, ResolvedMedia } from '@vellin/shared';
import type { Resolver } from './Resolver.js';
import { ResolveError } from './Resolver.js';

const YT_DLP_BIN = process.env.YT_DLP_BIN ?? 'yt-dlp';
const TIMEOUT_MS = 30_000;
const DEFAULT_TTL_MS = 5 * 60 * 60 * 1000;
// Caps the video track height we request from yt-dlp. 1080 keeps per-viewer
// bandwidth reasonable while still being a clear upgrade over the 360p
// progressive cap on YouTube. Override via env if needed.
const MAX_VIDEO_HEIGHT = Number(process.env.YOUTUBE_MAX_HEIGHT ?? '1080') || 1080;

interface YtDlpFormat {
  url?: string;
  ext?: string;
  protocol?: string;
  vcodec?: string;
  acodec?: string;
  height?: number | null;
  width?: number | null;
  expires?: number;
}

interface YtDlpInfo extends YtDlpFormat {
  title?: string;
  duration?: number;
  thumbnail?: string;
  is_live?: boolean;
  extractor?: string;
  webpage_url?: string;
  /** Present when the chosen format is the result of a merge (video+audio). */
  requested_formats?: YtDlpFormat[];
}

/**
 * Catch-all resolver: shells out to the `yt-dlp` binary, asks for a single
 * playable format, and maps its protocol/extension to a MediaKind.
 *
 * Operational notes:
 *  - Requires `yt-dlp` on PATH (see Dockerfile).
 *  - Has its own 30s wall-clock timeout independent of HTTP-level timeouts.
 */
export class YtDlpResolver implements Resolver {
  readonly name = 'yt-dlp';

  canResolve(url: URL): boolean {
    return url.protocol === 'http:' || url.protocol === 'https:';
  }

  async resolve(raw: string): Promise<ResolvedMedia> {
    const info = await runYtDlp(raw);

    // Detect a dual-stream merge: yt-dlp picked separate video and audio
    // tracks and listed them in `requested_formats`. We hand both URLs to
    // the client unchanged — the player keeps them in sync.
    const dual = pickDualPair(info);
    if (dual) {
      const { videoFmt, audioFmt } = dual;
      const videoUrl = videoFmt.url!;
      const audioUrl = audioFmt.url!;
      if (sameOrigin(videoUrl, raw)) {
        throw new ResolveError(
          `yt-dlp returned source URL unchanged for ${raw}`,
          'Не удалось извлечь поток с этого источника',
        );
      }
      return {
        kind: 'dual',
        mediaUrl: videoUrl,
        audioUrl,
        // Skip mime: muxed-by-browser scenario, mime hint on the video-only
        // track would mislead. Browser sniffs the segments itself.
        title: info.title ?? undefined,
        durationSec: typeof info.duration === 'number' ? info.duration : undefined,
        poster: info.thumbnail ?? undefined,
        sourceUrl: raw,
        resolvedAt: Date.now(),
        expiresAt: pickExpiry([videoFmt.expires, audioFmt.expires, info.expires]),
      };
    }

    const mediaUrl = info.url ?? raw;
    // If yt-dlp echoed the source page back as the media URL the extraction
    // effectively failed — we have no playable stream. Surface a real error
    // so the user knows to try a different link.
    if (sameOrigin(mediaUrl, raw)) {
      throw new ResolveError(
        `yt-dlp returned source URL unchanged for ${raw}`,
        'Не удалось извлечь поток с этого источника',
      );
    }
    const kind = classify(info, mediaUrl);
    const mime = kind === 'direct' ? guessMime(info.ext) : undefined;

    return {
      kind,
      mediaUrl,
      mime,
      title: info.title ?? undefined,
      durationSec: typeof info.duration === 'number' ? info.duration : undefined,
      poster: info.thumbnail ?? undefined,
      sourceUrl: raw,
      resolvedAt: Date.now(),
      expiresAt: pickExpiry([info.expires]),
    };
  }
}

/**
 * Returns the (video-only, audio-only) pair when yt-dlp merged two streams.
 * Returns null when the chosen format is single-file (progressive mp4, HLS,
 * DASH manifest, etc.) — caller falls back to legacy single-URL handling.
 */
function pickDualPair(
  info: YtDlpInfo,
): { videoFmt: YtDlpFormat; audioFmt: YtDlpFormat } | null {
  const fmts = info.requested_formats;
  if (!Array.isArray(fmts) || fmts.length < 2) return null;
  const video = fmts.find(
    (f) => f.url && f.vcodec && f.vcodec !== 'none' && (!f.acodec || f.acodec === 'none'),
  );
  const audio = fmts.find(
    (f) => f.url && f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'),
  );
  if (!video || !audio) return null;
  // Both must be HTTP-progressive segments (range-fetched mp4/webm). Manifest
  // protocols (m3u8/dash) on either side don't combine cleanly via two HTML5
  // elements — let the single-URL path classify and play the manifest.
  const httpish = (p: string | undefined): boolean =>
    !!p && (p.startsWith('http') || p === 'https' || p === 'http');
  if (!httpish(video.protocol) || !httpish(audio.protocol)) return null;
  return { videoFmt: video, audioFmt: audio };
}

function pickExpiry(candidates: Array<number | undefined>): number {
  const now = Date.now();
  const valid = candidates
    .map((c) => (typeof c === 'number' && Number.isFinite(c) ? c * 1000 : null))
    .filter((c): c is number => c !== null && c > now);
  if (valid.length === 0) return now + DEFAULT_TTL_MS;
  return Math.min(...valid);
}

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).hostname === new URL(b).hostname;
  } catch {
    return false;
  }
}

function classify(info: YtDlpInfo, mediaUrl: string): MediaKind {
  const proto = (info.protocol ?? '').toLowerCase();
  if (proto.includes('m3u8')) return 'hls';
  if (proto.includes('dash') || /\.mpd($|\?)/i.test(mediaUrl)) return 'dash';
  if (/\.m3u8($|\?)/i.test(mediaUrl)) return 'hls';
  return 'direct';
}

function guessMime(ext: string | undefined): string | undefined {
  if (!ext) return undefined;
  switch (ext.toLowerCase()) {
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mov':
      return 'video/quicktime';
    case 'mkv':
      return 'video/x-matroska';
    case 'ogv':
    case 'ogg':
      return 'video/ogg';
    default:
      return undefined;
  }
}

function runYtDlp(url: string): Promise<YtDlpInfo> {
  return new Promise((resolve, reject) => {
    // Format priority:
    //   1) bestvideo (mp4, ≤MAX_HEIGHT, http) + bestaudio (m4a, http)  ← real HD
    //   2) same but allow webm video / any audio container
    //   3) bestvideo+bestaudio without container constraints
    //   4) progressive mp4 over http (the old behaviour, max 360p on YouTube)
    //   5) any progressive http stream
    //   6) absolute fallback (manifest URL — manifests classify() handles)
    //
    // `requested_formats` is populated by yt-dlp whenever the chosen format
    // is a `video+audio` merge — that's what triggers dual-stream playback
    // in resolve(). Single-file formats keep the legacy code path.
    const heightCap = `[height<=${MAX_VIDEO_HEIGHT}]`;
    const format = [
      `bestvideo${heightCap}[ext=mp4][protocol^=http]+bestaudio[ext=m4a][protocol^=http]`,
      `bestvideo${heightCap}[protocol^=http]+bestaudio[protocol^=http]`,
      `bestvideo${heightCap}+bestaudio`,
      'best[ext=mp4][protocol^=http]',
      'best[protocol^=http]',
      'best',
    ].join('/');
    const child = spawn(
      YT_DLP_BIN,
      [
        '--dump-single-json',
        '--no-warnings',
        '--no-playlist',
        '--no-call-home',
        '--socket-timeout',
        '15',
        '--format',
        format,
        url,
      ],
      { windowsHide: true },
    );

    let stdout = '';
    let stderr = '';
    let settled = false;
    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      fn();
    };

    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
      settle(() => reject(new ResolveError('yt-dlp timed out', 'Resolver timed out')));
    }, TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      settle(() =>
        reject(
          new ResolveError(
            `yt-dlp spawn failed: ${(err as Error).message}`,
            'Media resolver is not installed on the server. Install yt-dlp.',
            err,
          ),
        ),
      );
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const snippet = stderr.split('\n').slice(-3).join(' ').trim();
        settle(() =>
          reject(
            new ResolveError(
              `yt-dlp exit ${code}: ${snippet}`,
              `Couldn't extract media from this link${snippet ? `: ${snippet}` : ''}`,
            ),
          ),
        );
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as YtDlpInfo;
        settle(() => resolve(parsed));
      } catch (err) {
        settle(() =>
          reject(
            new ResolveError(
              `yt-dlp parse failed: ${(err as Error).message}`,
              'Resolver returned malformed output',
              err,
            ),
          ),
        );
      }
    });
  });
}
