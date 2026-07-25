import { loadEnv } from '../env.js';

/**
 * Превращает публичный путь загруженного файла (`/api/uploads/...`) в
 * АБСОЛЮТНЫЙ URL, если задан PUBLIC_BASE_URL. Нужно нативным клиентам: у них нет
 * origin, поэтому относительный путь `/api/uploads/avatars/x.png` некуда
 * резолвить. Правила:
 *  - null/undefined → возвращаем как есть;
 *  - уже абсолютный (http/https) → как есть (внешние постеры не трогаем);
 *  - корне-относительный (`/...`) + задан PUBLIC_BASE_URL → префиксуем базой;
 *  - иначе (нет базы) → возвращаем как есть (обратная совместимость с вебом,
 *    где браузер резолвит путь по origin).
 */
export function absoluteUrl<T extends string | null | undefined>(u: T): T {
  if (!u) return u;
  if (/^https?:\/\//i.test(u)) return u;
  if (!u.startsWith('/')) return u;
  const base = loadEnv().PUBLIC_BASE_URL;
  if (!base) return u;
  return (base + u) as T;
}
