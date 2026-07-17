import type { FavoriteTitle } from '@vellin/shared';
import { prisma } from '../db/prisma.js';

// Пользовательского лимита нет — предохранитель от абьюза (см. routes.ts).
const MAX = 100;

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

/** Перезаписывает позиции набора строк одной транзакцией (delete+create,
 * сохраняя снимок данных). Порядок задаётся входным массивом. */
async function repackFavorites(userId: string, rows: DbFavorite[]): Promise<FavoriteTitle[]> {
  await prisma.$transaction([
    prisma.favoriteTitle.deleteMany({ where: { userId } }),
    ...rows.map((t, i) =>
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
  return rows.map(toFavorite);
}

/** Точечно убирает один фильм из избранного и переупаковывает позиции. */
export async function removeFavorite(userId: string, kpId: number): Promise<FavoriteTitle[]> {
  const rows = await prisma.favoriteTitle.findMany({ where: { userId }, orderBy: { position: 'asc' } });
  const kept = rows.filter((r) => r.kpId !== kpId);
  if (kept.length === rows.length) return rows.map(toFavorite); // нечего удалять
  return repackFavorites(userId, kept);
}

/** Переупорядочивает избранное по массиву kpId. Незнакомые id игнорируются,
 * пропущенные существующие дописываются в конец в прежнем порядке. */
export async function reorderFavorites(userId: string, order: number[]): Promise<FavoriteTitle[]> {
  const rows = await prisma.favoriteTitle.findMany({ where: { userId }, orderBy: { position: 'asc' } });
  const byId = new Map(rows.map((r) => [r.kpId, r]));
  const seen = new Set<number>();
  const next: DbFavorite[] = [];
  for (const kpId of order) {
    const row = byId.get(kpId);
    if (row && !seen.has(kpId)) { seen.add(kpId); next.push(row); }
  }
  for (const row of rows) if (!seen.has(row.kpId)) next.push(row); // хвост без изменений
  return repackFavorites(userId, next);
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
