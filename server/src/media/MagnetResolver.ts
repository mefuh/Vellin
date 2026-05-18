import type { ResolvedMedia } from '@vellin/shared';
import type { Resolver } from './Resolver.js';

const TORRENT_FILE_RE = /\.torrent($|\?)/i;

export class MagnetResolver implements Resolver {
  readonly name = 'magnet';

  canResolve(_url: URL, raw: string): boolean {
    return raw.startsWith('magnet:') || TORRENT_FILE_RE.test(raw);
  }

  async resolve(raw: string): Promise<ResolvedMedia> {
    const now = Date.now();
    return {
      kind: 'torrent',
      mediaUrl: raw,
      sourceUrl: raw,
      resolvedAt: now,
      expiresAt: 0,
    };
  }
}
