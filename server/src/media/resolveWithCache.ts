import type { ResolvedMedia } from '@vellin/shared';
import { MediaCache } from './cache.js';
import { resolverChain } from './ResolverChain.js';

/**
 * In-flight de-duplication: if two clients submit the same URL within the
 * same second, only one yt-dlp invocation runs and both await the same
 * promise. Cleared when the resolve settles.
 */
const inflight = new Map<string, Promise<ResolvedMedia>>();

export async function resolveWithCache(rawUrl: string): Promise<ResolvedMedia> {
  const cached = await MediaCache.get(rawUrl);
  if (cached) return cached;

  const existing = inflight.get(rawUrl);
  if (existing) return existing;

  const promise = (async (): Promise<ResolvedMedia> => {
    try {
      const fresh = await resolverChain.resolve(rawUrl);
      // Best-effort cache write; failure here shouldn't block the response.
      await MediaCache.set(fresh, fresh).catch(() => undefined);
      return fresh;
    } finally {
      inflight.delete(rawUrl);
    }
  })();
  inflight.set(rawUrl, promise);
  return promise;
}
