#!/usr/bin/env node
/**
 * Одна команда «от клона до работающего приложения»: поднимает Postgres,
 * ставит зависимости, готовит server/.env (с автогенерацией JWT_SECRET),
 * собирает @vellin/shared, накатывает миграции и запускает npm run dev.
 *
 * Идемпотентен — можно перезапускать сколько угодно раз, ничего не ломает.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENV = path.join(ROOT, 'server', '.env');
const SERVER_ENV_EXAMPLE = path.join(ROOT, 'server', '.env.example');

const c = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

function step(n, total, title) {
  console.log(`\n${c.bold(`[${n}/${total}]`)} ${title}`);
}

function run(cmd, opts = {}) {
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts });
}

function tryRun(cmd, opts = {}) {
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'ignore', ...opts });
    return true;
  } catch {
    return false;
  }
}

function fail(message) {
  console.error(`\n${c.red('✗')} ${message}`);
  process.exit(1);
}

async function main() {
  const TOTAL = 6;
  console.log(c.bold('Vellin — локальный запуск в одну команду\n'));

  // ── 1. Проверки окружения ────────────────────────────────────────────
  step(1, TOTAL, 'Проверка окружения');

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor < 20) {
    fail(`Нужен Node.js 20+, у вас ${process.versions.node}. Обновите Node и запустите снова.`);
  }
  console.log(`  ${c.green('✓')} Node.js ${process.versions.node}`);

  const hasDocker = tryRun('docker version');
  const hasCompose = hasDocker && tryRun('docker compose version');
  if (!hasCompose) {
    console.log(
      `  ${c.yellow('!')} Docker (или docker compose) не найден — пропускаю автозапуск Postgres.\n` +
        `    Поднимите Postgres 16 сами и укажите DATABASE_URL в server/.env.`,
    );
  } else {
    console.log(`  ${c.green('✓')} Docker + docker compose`);
  }

  const hasYtDlp = tryRun('yt-dlp --version') || tryRun('yt-dlp.exe --version');
  if (!hasYtDlp) {
    console.log(
      `  ${c.yellow('!')} yt-dlp не найден в PATH — без него будут работать только прямые\n` +
        `    ссылки mp4/webm/m3u8/mpd и magnet. Поставить: winget install yt-dlp.yt-dlp (Windows)\n` +
        `    / brew install yt-dlp (macOS) / pip install yt-dlp (Linux).`,
    );
  } else {
    console.log(`  ${c.green('✓')} yt-dlp`);
  }

  // ── 2. Postgres ───────────────────────────────────────────────────────
  step(2, TOTAL, 'Postgres');
  if (hasCompose) {
    run('docker compose up -d postgres');
    console.log('  Ждём готовности контейнера...');
    const cid = execSync('docker compose ps -q postgres', { cwd: ROOT }).toString().trim();
    let healthy = false;
    for (let i = 0; i < 30; i++) {
      const status = tryGetHealth(cid);
      if (status === 'healthy') {
        healthy = true;
        break;
      }
      await sleep(2000);
    }
    if (!healthy) {
      console.log(`  ${c.yellow('!')} Postgres не подтвердил готовность за 60с — продолжаю всё равно.`);
    } else {
      console.log(`  ${c.green('✓')} Postgres готов`);
    }
  }

  // ── 3. Зависимости ───────────────────────────────────────────────────
  step(3, TOTAL, 'npm install (shared + server + client)');
  run('npm install');

  // ── 4. server/.env ───────────────────────────────────────────────────
  step(4, TOTAL, 'server/.env');
  if (!existsSync(SERVER_ENV)) {
    copyFileSync(SERVER_ENV_EXAMPLE, SERVER_ENV);
    const secret = randomBytes(48).toString('hex');
    let content = readFileSync(SERVER_ENV, 'utf8');
    content = content.replace(
      /^JWT_SECRET=.*$/m,
      `JWT_SECRET=${secret}`,
    );
    writeFileSync(SERVER_ENV, content);
    console.log(`  ${c.green('✓')} server/.env создан, JWT_SECRET сгенерирован автоматически`);
  } else {
    const content = readFileSync(SERVER_ENV, 'utf8');
    const match = content.match(/^JWT_SECRET=(.*)$/m);
    const secret = match?.[1]?.trim() ?? '';
    if (secret.length < 32) {
      fail(
        `server/.env уже существует, но JWT_SECRET короче 32 символов.\n` +
          `Поправьте его вручную (любая случайная строка от 32 символов) и запустите скрипт снова.`,
      );
    }
    console.log(`  ${c.green('✓')} server/.env уже настроен, оставляю как есть`);
  }

  // ── 5. Сборка shared + миграции ──────────────────────────────────────
  step(5, TOTAL, 'Сборка @vellin/shared и миграции БД');
  run('npm run build:shared');
  run('npm run db:migrate');

  // ── 6. Запуск ─────────────────────────────────────────────────────────
  step(6, TOTAL, 'Запуск (shared watch + server + client)');
  console.log(
    `\n${c.green('Готово.')} Открывайте ${c.bold('http://localhost:5173')} после старта ниже.\n` +
      `${c.dim('Остановить — Ctrl+C.')}\n`,
  );
  run('npm run dev');
}

function tryGetHealth(containerId) {
  try {
    return execSync(`docker inspect -f "{{.State.Health.Status}}" ${containerId}`, { cwd: ROOT })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
