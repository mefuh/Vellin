import allCities from 'all-the-cities';
import { logger } from '../utils/logger.js';

/**
 * Геосправочник городов мира (датасет all-the-cities = GeoNames, население
 * ≥1000). Названия городов — латиницей (как в источнике), страна локализуется
 * в русский через Intl.DisplayNames. На старте массив раскладывается в
 * компактные параллельные индексы, а оригинал отбрасывается (GC).
 *
 * Используется для:
 *  - автодополнения в поле «Город» профиля (`searchCities`);
 *  - строгой проверки сохраняемого значения (`isKnownCity`), чтобы туда нельзя
 *    было записать произвольный текст.
 */

const regionRu = new Intl.DisplayNames(['ru'], { type: 'region' });
function countryNameRu(code: string): string {
  try {
    return regionRu.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Нормализация для регистронезависимого сравнения/поиска. */
function norm(s: string): string {
  return s.normalize('NFC').toLowerCase().replace(/ё/gu, 'е').trim();
}

const cityNames: string[] = [];
const cityNorm: string[] = [];
const countryIdx: number[] = [];
const pops: number[] = [];
const countryRu: string[] = [];
const countryRuNorm: string[] = [];
const countryByCode = new Map<string, number>();
/** Множество нормализованных подписей «город, страна» — для O(1) валидации. */
const validLabels = new Set<string>();

const t0 = Date.now();
for (const c of allCities) {
  let ci = countryByCode.get(c.country);
  if (ci === undefined) {
    ci = countryRu.length;
    countryByCode.set(c.country, ci);
    const ru = countryNameRu(c.country);
    countryRu.push(ru);
    countryRuNorm.push(norm(ru));
  }
  cityNames.push(c.name);
  cityNorm.push(norm(c.name));
  countryIdx.push(ci);
  pops.push(c.population);
  validLabels.add(`${norm(c.name)}, ${countryRuNorm[ci]}`);
}
logger.info({ count: cityNames.length, ms: Date.now() - t0 }, 'geo: cities index built');

function labelOf(i: number): string {
  return `${cityNames[i]}, ${countryRu[countryIdx[i]]}`;
}

/**
 * Топ-`limit` подсказок по подстроке. Сначала совпадения с начала названия,
 * затем по убыванию населения. Дубликаты подписей схлопываются.
 */
export function searchCities(q: string, limit = 8): string[] {
  const nq = norm(q);
  if (nq.length < 2) return [];
  const hits: { i: number; prefix: boolean; pop: number }[] = [];
  for (let i = 0; i < cityNorm.length; i++) {
    const at = cityNorm[i].indexOf(nq);
    if (at === -1) continue;
    hits.push({ i, prefix: at === 0, pop: pops[i] });
  }
  hits.sort((a, b) => (a.prefix !== b.prefix ? (a.prefix ? -1 : 1) : b.pop - a.pop));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const h of hits) {
    const label = labelOf(h.i);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(label);
    if (out.length >= limit) break;
  }
  return out;
}

/** Принадлежит ли подпись «город, страна» справочнику. */
export function isKnownCity(label: string): boolean {
  return validLabels.has(norm(label));
}
