// Генерация оверлея русских названий городов: geonameid → «русское имя».
//
// Источник — полный файл GeoNames alternateNamesV2.txt (колонки: alternateNameId,
// geonameid, isolanguage, name, isPreferredName, isShortName, isColloquial,
// isHistoric, from, to). Берём только язык `ru`, не исторические и не разговорные,
// предпочитаем isPreferredName. Оставляем лишь geonameid, которые есть в базовом
// списке all-the-cities (чтобы оверлей был компактным).
//
// Запуск (из корня репозитория):
//   node server/scripts/build-cities-ru.mjs <путь к alternateNamesV2.txt>
//
// Результат пишется в server/src/geo/cities-ru.json и коммитится в репозиторий.
// В прод-образ файл копируется Dockerfile'ом рядом с собранным модулем (dist/geo).

import { createReadStream, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import readline from 'node:readline';
import allCities from 'all-the-cities';

const altPath = process.argv[2];
if (!altPath) {
  console.error('usage: node build-cities-ru.mjs <alternateNamesV2.txt>');
  process.exit(1);
}

const CYRILLIC = /[А-Яа-яЁё]/u;
const cityIds = new Set(allCities.map((c) => c.cityId));
console.log('base cities:', cityIds.size);

/** id → { name, pref } — лучшее русское имя (предпочтительное побеждает). */
const best = new Map();
let scanned = 0;

const rl = readline.createInterface({
  input: createReadStream(altPath, 'utf8'),
  crlfDelay: Infinity,
});

for await (const line of rl) {
  if (!line) continue;
  // Быстрый отсев до split: интересует только язык ru.
  if (line.indexOf('\tru\t') === -1) continue;
  const c = line.split('\t');
  if (c[2] !== 'ru') continue;
  scanned++;
  const id = Number(c[1]);
  if (!cityIds.has(id)) continue;
  if (c[6] === '1' || c[7] === '1') continue; // colloquial / historic
  const name = (c[3] ?? '').trim();
  if (!name || !CYRILLIC.test(name)) continue;
  const pref = c[4] === '1';
  const cur = best.get(id);
  if (!cur || (pref && !cur.pref)) best.set(id, { name, pref });
}

const out = {};
for (const [id, v] of best) out[id] = v.name;

const outPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/geo/cities-ru.json',
);
writeFileSync(outPath, JSON.stringify(out));
console.log('ru rows scanned:', scanned);
console.log('cities with ru name:', Object.keys(out).length);
console.log('written:', outPath);
