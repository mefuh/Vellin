import type { FavoriteTitle } from '@vellin/shared';
import { loadEnv } from '../env.js';
import { logger } from '../utils/logger.js';

/**
 * Обёртка над kinopoisk.dev для поиска фильмов/сериалов (избранное в профиле).
 * Ответ нормализуется в FavoriteTitle. Результаты кэшируются в памяти (TTL 10м),
 * чтобы беречь бесплатный лимит токена — на профиль избранное берётся уже из
 * нашей БД, к API обращается только живой поиск.
 *
 * Базовый домен api.kinopoisk.dev отдаёт 301 на api.poiskkino.dev; fetch следует
 * за редиректом и сохраняет заголовок X-API-KEY.
 */

const BASE = 'https://api.kinopoisk.dev/v1.4';

interface KpDoc {
  id?: number;
  name?: string | null;
  alternativeName?: string | null;
  enName?: string | null;
  type?: string | null;
  year?: number | null;
  rating?: { kp?: number | null; imdb?: number | null } | null;
  poster?: { url?: string | null; previewUrl?: string | null } | null;
}

function round1(n: number | null | undefined): number | null {
  return typeof n === 'number' && n > 0 && n <= 10 ? Math.round(n * 10) / 10 : null;
}

function normalize(d: KpDoc): FavoriteTitle | null {
  const title = (d.name || d.alternativeName || d.enName || '').trim();
  if (!d.id || !title) return null;
  const original = (d.alternativeName || d.enName || '').trim();
  const poster = d.poster?.previewUrl || d.poster?.url || '';
  return {
    kpId: d.id,
    type: (d.type || 'movie').slice(0, 32),
    title: title.slice(0, 200),
    originalTitle: original && original !== title ? original.slice(0, 200) : null,
    year: typeof d.year === 'number' ? d.year : null,
    posterUrl: /^https:\/\//.test(poster) ? poster.slice(0, 500) : null,
    ratingKp: round1(d.rating?.kp),
    ratingImdb: round1(d.rating?.imdb),
  };
}

function httpError(status: number, message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode: status });
}

const cache = new Map<string, { at: number; titles: FavoriteTitle[] }>();
const TTL_MS = 10 * 60 * 1000;

export function isSearchEnabled(): boolean {
  return !!loadEnv().KINOPOISK_TOKEN;
}

export async function searchTitles(query: string): Promise<FavoriteTitle[]> {
  const token = loadEnv().KINOPOISK_TOKEN;
  if (!token) throw httpError(503, 'Поиск фильмов не настроен');
  const q = query.trim();
  if (q.length < 2) return [];

  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.titles;

  const url = `${BASE}/movie/search?page=1&limit=12&query=${encodeURIComponent(q)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'X-API-KEY': token, accept: 'application/json' } });
  } catch (e) {
    logger.warn({ err: (e as Error).message }, 'kinopoisk: fetch failed');
    throw httpError(502, 'Сервис поиска недоступен');
  }
  if (res.status === 429) throw httpError(429, 'Слишком много запросов к поиску, попробуйте позже');
  if (!res.ok) {
    logger.warn({ status: res.status }, 'kinopoisk: non-ok response');
    throw httpError(502, 'Сервис поиска недоступен');
  }
  const data = (await res.json()) as { docs?: KpDoc[] };
  const titles = (data.docs ?? [])
    .map(normalize)
    .filter((t): t is FavoriteTitle => t !== null);
  cache.set(key, { at: Date.now(), titles });
  return titles;
}
