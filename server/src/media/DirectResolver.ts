import type { MediaKind, ResolvedMedia } from '@vellin/shared';
import type { Resolver } from './Resolver.js';
import { ResolveError } from './Resolver.js';

const EXT_MAP: Array<[RegExp, MediaKind, string]> = [
  [/\.m3u8($|\?)/i, 'hls', 'application/vnd.apple.mpegurl'],
  [/\.mpd($|\?)/i, 'dash', 'application/dash+xml'],
  [/\.mp4($|\?)/i, 'direct', 'video/mp4'],
  [/\.webm($|\?)/i, 'direct', 'video/webm'],
  [/\.ogv?($|\?)/i, 'direct', 'video/ogg'],
  [/\.mov($|\?)/i, 'direct', 'video/quicktime'],
  [/\.mkv($|\?)/i, 'direct', 'video/x-matroska'],
];

const MIME_MAP: Array<[RegExp, MediaKind]> = [
  [/^application\/vnd\.apple\.mpegurl/i, 'hls'],
  [/^application\/x-mpegurl/i, 'hls'],
  [/^audio\/mpegurl/i, 'hls'],
  [/^application\/dash\+xml/i, 'dash'],
  [/^video\//i, 'direct'],
];

const HEAD_TIMEOUT_MS = 5000;
const DIRECT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Resolves URLs that already point at a playable stream. First tries to
 * classify by file extension (cheap, no network). Falls back to a HEAD
 * request to read the Content-Type. Returns null from `canResolve` if
 * neither path works so the chain moves on to yt-dlp.
 */
export class DirectResolver implements Resolver {
  readonly name = 'direct';

  canResolve(url: URL): boolean {
    return url.protocol === 'http:' || url.protocol === 'https:';
  }

  async resolve(raw: string): Promise<ResolvedMedia> {
    const url = new URL(raw);
    const byExt = matchExtension(url.pathname);
    if (byExt) {
      return buildResolved(raw, byExt.kind, byExt.mime);
    }

    const byHead = await probeContentType(raw).catch(() => null);
    if (byHead) {
      return buildResolved(raw, byHead.kind, byHead.mime);
    }

    throw new ResolveError(
      `DirectResolver: ${raw} is not a recognizable direct stream`,
      'Not a direct media URL',
    );
  }
}

function matchExtension(pathname: string): { kind: MediaKind; mime: string } | null {
  for (const [re, kind, mime] of EXT_MAP) {
    if (re.test(pathname)) return { kind, mime };
  }
  return null;
}

async function probeContentType(url: string): Promise<{ kind: MediaKind; mime: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type');
    if (!ct) return null;
    for (const [re, kind] of MIME_MAP) {
      if (re.test(ct)) return { kind, mime: ct.split(';')[0]!.trim() };
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function buildResolved(sourceUrl: string, kind: MediaKind, mime: string): ResolvedMedia {
  const now = Date.now();
  return {
    kind,
    mediaUrl: sourceUrl,
    mime,
    sourceUrl,
    resolvedAt: now,
    expiresAt: now + DIRECT_TTL_MS,
  };
}
