import { spawn } from 'node:child_process';
import type { MediaKind, ResolvedMedia } from '@vellin/shared';
import type { Resolver } from './Resolver.js';
import { ResolveError } from './Resolver.js';

const YT_DLP_BIN = process.env.YT_DLP_BIN ?? 'yt-dlp';
const TIMEOUT_MS = 30_000;
const DEFAULT_TTL_MS = 5 * 60 * 60 * 1000;

interface YtDlpInfo {
  url?: string;
  ext?: string;
  protocol?: string;
  title?: string;
  duration?: number;
  thumbnail?: string;
  is_live?: boolean;
  extractor?: string;
  webpage_url?: string;
  /** yt-dlp sometimes signs URLs with an explicit expiry in the format object. */
  expires?: number;
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

    const now = Date.now();
    const expiresAt =
      typeof info.expires === 'number' && Number.isFinite(info.expires) && info.expires > now / 1000
        ? info.expires * 1000
        : now + DEFAULT_TTL_MS;

    return {
      kind,
      mediaUrl,
      mime,
      title: info.title ?? undefined,
      durationSec: typeof info.duration === 'number' ? info.duration : undefined,
      poster: info.thumbnail ?? undefined,
      sourceUrl: raw,
      resolvedAt: now,
      expiresAt,
    };
  }
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
        'best[ext=mp4][protocol^=http]/best[protocol^=http]/best',
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
