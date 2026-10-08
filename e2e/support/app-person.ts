import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { API, RUN_DIR, SITE } from './env';
import type { Account } from './person';

/**
 * Человек в клиенте для Windows.
 *
 * Настоящее приложение запускается через Flutter `integration_test`
 * (winapp/integration_test/remote_person_test.dart): тот отдаёт наружу, что
 * видно на экране, и выполняет действия человека. Здесь — сторона
 * управления: что сделать и чего дождаться.
 *
 * Приложение хранит вход в общем для всех его копий файле настроек
 * (%APPDATA%\ru.vellin\vellin_winapp\shared_preferences.json). Чтобы тест не
 * затёр сессию установленного у человека приложения, файл сохраняется в
 * копию до запуска и возвращается после — и при падении тоже (см. также
 * global-teardown).
 */

const WINAPP_DIR = join(__dirname, '..', '..', 'winapp');
export const APP_PREFS = join(process.env.APPDATA ?? '', 'ru.vellin', 'vellin_winapp', 'shared_preferences.json');
export const APP_PREFS_BACKUP = join(RUN_DIR, 'app-prefs-backup.json');
const FLUTTER = process.env.FLUTTER ?? 'C:\\src\\flutter\\bin\\flutter.bat';

export interface AppScreen {
  done: number;
  error: string | null;
  texts: string[];
  labels: string[];
}

/** Сохранить настройки приложения человека (один раз за прогон). */
export function backupAppPrefs(): void {
  if (existsSync(APP_PREFS_BACKUP)) return;
  mkdirSync(RUN_DIR, { recursive: true });
  if (existsSync(APP_PREFS)) copyFileSync(APP_PREFS, APP_PREFS_BACKUP);
  else appendFileSync(APP_PREFS_BACKUP, ''); // пустая копия: файла не было
}

/** Вернуть настройки приложения человека на место. */
export function restoreAppPrefs(): void {
  if (!existsSync(APP_PREFS_BACKUP)) return;
  const backup = readFileSync(APP_PREFS_BACKUP);
  if (backup.length === 0) {
    if (existsSync(APP_PREFS)) unlinkSync(APP_PREFS);
  } else {
    copyFileSync(APP_PREFS_BACKUP, APP_PREFS);
  }
  unlinkSync(APP_PREFS_BACKUP);
}

export class AppPerson {
  private proc: ChildProcess | null = null;
  private sent = 0;
  private readonly dir: string;
  log = '';

  constructor(readonly account: Account) {
    this.dir = join(RUN_DIR, `app-${account.id}`);
  }

  get name(): string {
    return this.account.username;
  }

  /** Запустить приложение с чистого листа и войти через его форму. */
  async start(): Promise<void> {
    backupAppPrefs();
    // С чистого листа: приложение должно показать вход, а не чужую сессию.
    if (existsSync(APP_PREFS)) unlinkSync(APP_PREFS);
    rmSync(this.dir, { recursive: true, force: true });
    mkdirSync(this.dir, { recursive: true });
    const server = API.replace(/\/api$/, '');
    this.proc = spawn(
      FLUTTER,
      [
        'test',
        'integration_test/remote_person_test.dart',
        '-d',
        'windows',
        '--no-pub',
        `--dart-define=SERVER_URL=${server}`,
        `--dart-define=SITE_URL=${SITE}`,
        // Путь с пробелами: запуск идёт через оболочку, без кавычек он развалится.
        `"--dart-define=VELLIN_E2E_CONTROL=${this.dir}"`,
      ],
      { cwd: WINAPP_DIR, shell: true, windowsHide: true },
    );
    this.proc.stdout?.on('data', (d) => (this.log += String(d)));
    this.proc.stderr?.on('data', (d) => (this.log += String(d)));

    // Первая сборка тестового приложения занимает минуты.
    await expect
      .poll(() => existsSync(join(this.dir, 'status.json')) || this.proc?.exitCode !== null, {
        timeout: 8 * 60_000,
        intervals: [1000],
        message: 'приложение не запустилось',
      })
      .toBe(true);
    if (this.proc?.exitCode !== null) throw new Error(`приложение завершилось: ${this.log.slice(-2000)}`);

    await this.waitForText('Войти', 90_000);
    await this.act('type:you@example.com=' + this.account.email);
    await this.act('type:••••••••=' + this.account.password);
    await this.act('tap:Войти');
    await expect
      .poll(async () => (await this.screen()).texts.includes('Войти'), {
        timeout: 60_000,
        message: 'вход в приложение не прошёл',
      })
      .toBe(false);
  }

  /** Что сейчас на экране приложения. */
  async screen(): Promise<AppScreen> {
    try {
      return JSON.parse(readFileSync(join(this.dir, 'status.json'), 'utf8')) as AppScreen;
    } catch {
      return { done: 0, error: null, texts: [], labels: [] };
    }
  }

  /**
   * Приложение живо: процесс работает и отвечает — экран обновлялся только
   * что. Вылет или зависание видно здесь, а не по таймаутам действий.
   */
  async alive(): Promise<boolean> {
    if (!this.proc || this.proc.exitCode !== null) return false;
    try {
      const at = (JSON.parse(readFileSync(join(this.dir, 'status.json'), 'utf8')) as { at: string }).at;
      return Date.now() - Date.parse(at) < 5000;
    } catch {
      return false;
    }
  }

  /** Видна ли подпись — текстом или у кнопки. */
  async sees(text: string): Promise<boolean> {
    const s = await this.screen();
    return s.texts.includes(text) || s.labels.includes(text);
  }

  async waitForText(text: string, timeout = 30_000): Promise<void> {
    await expect.poll(() => this.sees(text), { timeout, message: `в приложении не появилось «${text}»` }).toBe(true);
  }

  async waitGone(text: string, timeout = 30_000): Promise<void> {
    try {
      await expect.poll(() => this.sees(text), { timeout }).toBe(false);
    } catch {
      const s = await this.screen();
      throw new Error(
        `в приложении не исчезло «${text}». На экране: ${s.texts.slice(0, 40).join(' · ')}. Окно: ${this.windowState()}`,
      );
    }
  }

  /** Сделать действие и дождаться, что оно выполнено. */
  async act(cmd: string): Promise<void> {
    appendFileSync(join(this.dir, 'commands'), `${cmd}\n`);
    this.sent++;
    const target = this.sent;
    await expect
      .poll(async () => (await this.screen()).done >= target, {
        timeout: 30_000,
        message: `не выполнено: ${cmd}. Окно: ${this.windowState()}`,
      })
      .toBe(true);
    const s = await this.screen();
    if (s.error) throw new Error(`приложение: ${s.error}`);
  }

  /** Как Windows видит окно тестового клиента: отвечает ли оно, жив ли процесс. */
  windowState(): string {
    const exe = join(WINAPP_DIR, 'build', 'windows', 'x64', 'runner', 'Debug', 'vellin_winapp.exe');
    try {
      return execFileSync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `$p = Get-Process vellin_winapp -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '${exe.replace(/'/g, "''")}' }; if ($p) { 'процесс жив, отвечает: ' + $p.Responding + ', ЦП: ' + [math]::Round($p.CPU, 1) + ' с' } else { 'процесса нет (вылет)' }`,
        ],
        { encoding: 'utf8' },
      ).trim();
    } catch {
      return 'неизвестно';
    }
  }

  /** Последние строки вывода тестового клиента. */
  tail(): string {
    return this.log
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .slice(-40)
      .join('\n');
  }

  tap(label: string): Promise<void> {
    return this.act(`tap:${label}`);
  }

  async stop(): Promise<void> {
    try {
      if (this.proc && this.proc.exitCode === null) {
        appendFileSync(join(this.dir, 'commands'), 'quit\n');
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, 20_000);
          this.proc!.once('exit', () => {
            clearTimeout(t);
            resolve();
          });
        });
      }
    } finally {
      if (this.proc && this.proc.exitCode === null && this.proc.pid) {
        try {
          execFileSync('taskkill', ['/PID', String(this.proc.pid), '/T', '/F'], { stdio: 'ignore' });
        } catch {
          /* уже завершён */
        }
      }
      killTestApp();
      restoreAppPrefs();
    }
  }
}

/** Закрыть тестовую сборку приложения — только её, по пути, не установленное у человека. */
export function killTestApp(): void {
  const exe = join(WINAPP_DIR, 'build', 'windows', 'x64', 'runner', 'Debug', 'vellin_winapp.exe');
  try {
    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Get-Process vellin_winapp -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '${exe.replace(/'/g, "''")}' } | Stop-Process -Force`,
      ],
      { stdio: 'ignore' },
    );
  } catch {
    /* нечего закрывать */
  }
}
