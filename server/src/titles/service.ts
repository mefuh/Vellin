import type { FavoriteTitle } from '@vellin/shared';
import { prisma } from '../db/prisma.js';

const MAX = 5;

interface DbFavorite {
  kpId: number;
  type: string;
  title: string;
  originalTitle: string | null;
  year: number | null;
  posterUrl: string | null;
  ratingKp: number | null;
  ratingImdb: number | null;
}

export function toFavorite(r: DbFavorite): FavoriteTitle {
  return {
    kpId: r.kpId,
    type: r.type,
    title: r.title,
    originalTitle: r.originalTitle,
    year: r.year,
    posterUrl: r.posterUrl,
    ratingKp: r.ratingKp,
    ratingImdb: r.ratingImdb,
  };
}

export async function getFavorites(userId: string): Promise<FavoriteTitle[]> {
  const rows = await prisma.favoriteTitle.findMany({
    where: { userId },
    orderBy: { position: 'asc' },
  });
  return rows.map(toFavorite);
}

function clampRating(n: unknown): number | null {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 && v <= 10 ? Math.round(v * 10) / 10 : null;
}

/** Чистим присланный клиентом снимок: типы, длины, валидный https-постер. */
function sanitize(input: FavoriteTitle): FavoriteTitle | null {
  const kpId = Number(input?.kpId);
  if (!Number.isInteger(kpId) || kpId <= 0) return null;
  const title = String(input?.title ?? '').trim().slice(0, 200);
  if (!title) return null;
  const original = String(input?.originalTitle ?? '').trim().slice(0, 200);
  const poster = String(input?.posterUrl ?? '');
  const year = Number(input?.year);
  return {
    kpId,
    type: String(input?.type ?? 'movie').slice(0, 32),
    title,
    originalTitle: original && original !== title ? original : null,
    year: Number.isInteger(year) && year >= 1850 && year <= 2100 ? year : null,
    posterUrl: /^https:\/\//.test(poster) ? poster.slice(0, 500) : null,
    ratingKp: clampRating(input?.ratingKp),
    ratingImdb: clampRating(input?.ratingImdb),
  };
}

/** Полная замена избранного пользователя (≤5, дубли по kpId отсекаются). */
export async function setFavorites(userId: string, items: FavoriteTitle[]): Promise<FavoriteTitle[]> {
  const clean: FavoriteTitle[] = [];
  const seen = new Set<number>();
  for (const it of (items ?? []).slice(0, MAX)) {
    const s = sanitize(it);
    if (s && !seen.has(s.kpId)) {
      seen.add(s.kpId);
      clean.push(s);
    }
  }
  await prisma.$transaction([
    prisma.favoriteTitle.deleteMany({ where: { userId } }),
    ...clean.map((t, i) =>
      prisma.favoriteTitle.create({
        data: {
          userId,
          position: i,
          kpId: t.kpId,
          type: t.type,
          title: t.title,
          originalTitle: t.originalTitle,
          year: t.year,
          posterUrl: t.posterUrl,
          ratingKp: t.ratingKp,
          ratingImdb: t.ratingImdb,
        },
      }),
    ),
  ]);
  return clean;
}
