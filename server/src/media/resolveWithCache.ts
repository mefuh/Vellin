import type { ResolvedMedia } from '@vellin/shared';
import { MediaCache } from './cache.js';
import { resolverChain } from './ResolverChain.js';
import { canonicalYouTubeUrl, extractYouTubeId, youtubeEmbedResolved } from './youtube.js';
import { logger } from '../utils/logger.js';

/**
 * In-flight de-duplication: if two clients submit the same URL within the
 * same second, only one yt-dlp invocation runs and both await the same
 * promise. Cleared when the resolve settles. Keyed by the NORMALIZED url so
 * `youtu.be/X` и `youtube.com/watch?v=X` делят один резолв.
 */
const inflight = new Map<string, Promise<ResolvedMedia>>();

export async function resolveWithCache(rawUrl: string): Promise<ResolvedMedia> {
  // Канонизируем YouTube-формы к одному ключу — иначе разные ссылки на одно
  // видео резолвятся независимо и дают разный результат (то с аудио, то без).
  const key = canonicalYouTubeUrl(rawUrl) ?? rawUrl;

  const cached = await MediaCache.get(key);
  if (cached) return cached;

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<ResolvedMedia> => {
    try {
      let fresh: ResolvedMedia;
      try {
        fresh = await resolverChain.resolve(key);
      } catch (err) {
        // Извлечение прямого потока не удалось. Для YouTube не падаем, а
        // отдаём встроенный плеер (iframe) — видео всё равно запустится.
        const id = extractYouTubeId(key);
        if (id) {
          logger.warn(
            { err: (err as Error).message, url: key },
            'resolve: extraction failed for YouTube — falling back to iframe embed',
          );
          fresh = youtubeEmbedResolved(key, id);
        } else {
          throw err;
        }
      }
      // Best-effort cache write; failure here shouldn't block the response.
      await MediaCache.set(fresh, fresh).catch(() => undefined);
      return fresh;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}
