/**
 * Копирует не-TypeScript ассеты из src/ в dist/ после сборки: tsc компилирует
 * только .ts и молча игнорирует прочие файлы (напр. src/geo/cities-ru.json —
 * оверлей русских названий городов, читаемый в рантайме через import.meta.url).
 * Без этого шага `node dist/index.js` падает с ENOENT на первом же обращении к
 * гео-справочнику. Делает `npm run build` самодостаточным для ЛЮБОГО деплоя, а
 * не только для Dockerfile (где раньше ассет копировался вручную отдельным COPY).
 *
 * rootDir=./src → outDir=./dist (см. tsconfig.json) — зеркалим структуру 1:1.
 * Кросс-платформенно (Windows dev + alpine CI): чистый Node, без shell-команд.
 */
import { cp, mkdir, readdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(SERVER_DIR, 'src');
const DIST = join(SERVER_DIR, 'dist');

/** Расширения, которые собирает tsc — их копировать не нужно. */
const CODE_EXT = new Set(['.ts', '.tsx', '.mts', '.cts']);

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

let copied = 0;
for await (const file of walk(SRC)) {
  const dot = file.lastIndexOf('.');
  const ext = dot === -1 ? '' : file.slice(dot);
  if (CODE_EXT.has(ext)) continue;
  const dest = join(DIST, relative(SRC, file));
  await mkdir(dirname(dest), { recursive: true });
  await cp(file, dest);
  copied++;
  console.log(`copy-assets: ${relative(SERVER_DIR, file)} -> ${relative(SERVER_DIR, dest)}`);
}
console.log(`copy-assets: done (${copied} file${copied === 1 ? '' : 's'})`);
