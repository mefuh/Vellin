import type { ResolvedMedia } from '@vellin/shared';
import type { Resolver } from './Resolver.js';
import { ResolveError } from './Resolver.js';
import { MagnetResolver } from './MagnetResolver.js';
import { DirectResolver } from './DirectResolver.js';
import { YtDlpResolver } from './YtDlpResolver.js';
import { logger } from '../utils/logger.js';

/**
 * Tries resolvers in order. The first one whose `canResolve` returns true
 * gets a shot; if it throws, the next applicable one is tried. Direct mp4
 * recognition is cheap so it comes before the yt-dlp spawn.
 */
export class ResolverChain {
  private readonly resolvers: Resolver[];

  constructor(resolvers?: Resolver[]) {
    this.resolvers =
      resolvers ?? [new MagnetResolver(), new DirectResolver(), new YtDlpResolver()];
  }

  async resolve(rawUrl: string): Promise<ResolvedMedia> {
    let url: URL | null = null;
    if (!rawUrl.startsWith('magnet:')) {
      try {
        url = new URL(rawUrl);
      } catch {
        throw new ResolveError('Invalid URL', 'The URL is malformed');
      }
    }

    const errors: string[] = [];
    for (const r of this.resolvers) {
      if (url && !r.canResolve(url, rawUrl)) continue;
      if (!url && r.name !== 'magnet') continue;
      try {
        const result = await r.resolve(rawUrl);
        logger.info({ resolver: r.name, kind: result.kind, sourceUrl: rawUrl }, 'media resolved');
        return result;
      } catch (err) {
        const msg = err instanceof ResolveError ? err.message : (err as Error).message;
        errors.push(`${r.name}: ${msg}`);
      }
    }
    throw new ResolveError(
      `All resolvers failed: ${errors.join(' | ')}`,
      'No resolver could handle this URL',
    );
  }
}

export const resolverChain = new ResolverChain();
