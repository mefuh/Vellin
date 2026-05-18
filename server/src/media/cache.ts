import type { ResolvedMedia } from '@vellin/shared';
import { prisma } from '../db/prisma.js';

export const MediaCache = {
  async get(sourceUrl: string): Promise<ResolvedMedia | null> {
    const row = await prisma.resolvedMedia.findUnique({ where: { sourceUrl } });
    if (!row) return null;
    // Treat expired rows as misses so the caller re-resolves.
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;
    return rowToResolved(row);
  },

  async set(resolved: ResolvedMedia, raw: unknown): Promise<void> {
    const expiresAt = resolved.expiresAt > 0 ? new Date(resolved.expiresAt) : null;
    await prisma.resolvedMedia.upsert({
      where: { sourceUrl: resolved.sourceUrl },
      create: {
        sourceUrl: resolved.sourceUrl,
        kind: resolved.kind,
        mediaUrl: resolved.mediaUrl,
        mime: resolved.mime ?? null,
        title: resolved.title ?? null,
        durationSec: resolved.durationSec ?? null,
        poster: resolved.poster ?? null,
        rawJson: JSON.stringify(raw ?? null),
        resolvedAt: new Date(resolved.resolvedAt),
        expiresAt,
      },
      update: {
        kind: resolved.kind,
        mediaUrl: resolved.mediaUrl,
        mime: resolved.mime ?? null,
        title: resolved.title ?? null,
        durationSec: resolved.durationSec ?? null,
        poster: resolved.poster ?? null,
        rawJson: JSON.stringify(raw ?? null),
        resolvedAt: new Date(resolved.resolvedAt),
        expiresAt,
      },
    });
  },
};

type ResolvedRow = Awaited<ReturnType<typeof prisma.resolvedMedia.findUnique>>;
type ResolvedRowNN = NonNullable<ResolvedRow>;

function rowToResolved(row: ResolvedRowNN): ResolvedMedia {
  return {
    kind: row.kind as ResolvedMedia['kind'],
    mediaUrl: row.mediaUrl,
    mime: row.mime ?? undefined,
    title: row.title ?? undefined,
    durationSec: row.durationSec ?? undefined,
    poster: row.poster ?? undefined,
    sourceUrl: row.sourceUrl,
    resolvedAt: row.resolvedAt.getTime(),
    expiresAt: row.expiresAt ? row.expiresAt.getTime() : 0,
  };
}
