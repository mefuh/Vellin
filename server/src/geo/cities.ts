import { readFileSync } from 'node:fs';
import allCities from 'all-the-cities';
import { logger } from '../utils/logger.js';

/**
 * Геосправочник городов мира (датасет all-the-cities = GeoNames, население
 * ≥1000). Поверх английских названий накладывается оверлей русских имён
 * (`cities-ru.json`, geonameid → имя; собран из GeoNames alternateNames скриптом
 * server/scripts/build-cities-ru.mjs). Отображаемое имя — русское, если есть,
 * иначе латиница; страна локализуется в русский через Intl.DisplayNames.
 *
 * Поиск матчит и кириллицу, и латиницу (находит «москва» и «moscow»). На старте
 * массив раскладывается в компактные параллельные индексы.
 *
 * Используется для:
 *  - автодополнения в поле «Город» профиля (`searchCities`);
 *  - строгой проверки сохраняемого значения (`isKnownCity`).
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

const display: string[] = []; // отображаемое имя (рус. или лат.)
const displayNorm: string[] = []; // норма display — поиск + сборка подписи
const latinNorm: string[] = []; // норма латинского имени — поиск по латинице
const countryIdx: number[] = [];
const pops: number[] = [];
const countryRu: string[] = [];
const countryRuNorm: string[] = [];
const countryByCode = new Map<string, number>();
/** Множество нормализованных подписей «город, страна» — для O(1) валидации. */
const validLabels = new Set<string>();

(function build(): void {
  const t0 = Date.now();
  const ru: Record<string, string> = JSON.parse(
    readFileSync(new URL('./cities-ru.json', import.meta.url), 'utf8'),
  ) as Record<string, string>;
  let withRu = 0;

  for (const c of allCities) {
    let ci = countryByCode.get(c.country);
    if (ci === undefined) {
      ci = countryRu.length;
      countryByCode.set(c.country, ci);
      const rn = countryNameRu(c.country);
      countryRu.push(rn);
      countryRuNorm.push(norm(rn));
    }
    const ruName = ru[c.cityId];
    const name = ruName ?? c.name;
    if (ruName) withRu++;
    const dN = norm(name);
    display.push(name);
    displayNorm.push(dN);
    // Если имя латинское — латинская норма совпадает с display, переиспользуем.
    latinNorm.push(ruName ? norm(c.name) : dN);
    countryIdx.push(ci);
    pops.push(c.population);
    validLabels.add(`${dN}, ${countryRuNorm[ci]}`);
  }
  logger.info(
    { count: display.length, withRu, ms: Date.now() - t0 },
    'geo: cities index built',
  );
})();

function labelOf(i: number): string {
  return `${display[i]}, ${countryRu[countryIdx[i]]}`;
}

/**
 * Топ-`limit` подсказок по подстроке (по русскому или латинскому имени).
 * Сначала совпадения с начала названия, затем по убыванию населения. Дубликаты
 * подписей схлопываются.
 */
export function searchCities(q: string, limit = 8): string[] {
  const nq = norm(q);
  if (nq.length < 2) return [];
  const hits: { i: number; prefix: boolean; pop: number }[] = [];
  for (let i = 0; i < displayNorm.length; i++) {
    const d = displayNorm[i].indexOf(nq);
    const l = latinNorm[i].indexOf(nq);
    if (d === -1 && l === -1) continue;
    hits.push({ i, prefix: d === 0 || l === 0, pop: pops[i] });
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
