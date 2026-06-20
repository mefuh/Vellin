import type { ResolvedMedia } from '@vellin/shared';

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

function isValidId(id: string | undefined | null): id is string {
  return !!id && ID_RE.test(id);
}

/**
 * Достаёт videoId из любой формы YouTube-ссылки (watch / youtu.be / embed /
 * shorts / live / music / m.). Возвращает null, если это не YouTube.
 */
export function extractYouTubeId(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '').toLowerCase();
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0];
    return isValidId(id) ? id : null;
  }
  if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    const v = u.searchParams.get('v');
    if (isValidId(v)) return v;
    const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/);
    if (m && isValidId(m[1])) return m[1];
  }
  return null;
}

/**
 * Канонизирует YouTube-ссылку к `https://www.youtube.com/watch?v=<id>` —
 * чтобы разные формы одного видео имели один ключ кэша и один резолв.
 * Для не-YouTube возвращает null.
 */
export function canonicalYouTubeUrl(raw: string): string | null {
  const id = extractYouTubeId(raw);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

/**
 * Запасной результат для YouTube, когда извлечение прямого потока невозможно:
 * встроенный плеер (iframe). Клиент проигрывает его через YouTubeIframeEngine.
 * Не истекает — embed не зависит от подписанных googlevideo-ссылок.
 */
export function youtubeEmbedResolved(sourceUrl: string, id: string): ResolvedMedia {
  return {
    kind: 'youtube_embed',
    mediaUrl: `https://www.youtube-nocookie.com/embed/${id}`,
    poster: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    sourceUrl,
    resolvedAt: Date.now(),
    expiresAt: 0,
  };
}
