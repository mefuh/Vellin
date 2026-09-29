import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useAppConfig } from '../hooks/useAppConfig';
import { DownloadGlyph } from '../landing/AppLanding';
import { APP_FACTS, APP_NOT_YET } from '../landing/appFacts';
import { VellinLockup, VellinMark } from '../landing/VellinMark';
import { NotFound } from './NotFound';
import '../landing/vx.css';
import '../landing/landing.css';
import '../landing/download.css';

/**
 * Страница скачивания клиента для Windows.
 *
 * Данные о публикации (версия и ссылка на установщик) — из того же
 * `/api/config`, откуда их читает автообновление самого приложения
 * (`update.windows`), второго источника правды о «текущей версии» нет. Пока
 * сборка не опубликована, страница честно говорит «скоро».
 *
 * Первый экран — проверка компьютера: страница отмечает по строке, подходит
 * ли система. Проверка по браузеру неточна, поэтому она только подсказывает:
 * скачать можно всегда.
 */

/** Размер установщика — для ожиданий по трафику. Сверять с каждой сборкой. */
const INSTALLER_SIZE = '≈ 55 МБ';

/**
 * Ссылка для кнопки на сайте.
 *
 * В конфиге адрес установщика абсолютный — таким он нужен нативному клиенту,
 * который обновляется без всякой страницы. Браузеру же абсолютный адрес вредит:
 * `https://localhost:5173/...` из dev-конфига (или прод-домен, открытый по
 * LAN-адресу) с другого компьютера не откроется. Поэтому, если файл лежит на
 * нашей же раздаче, ведём кнопку на тот же origin, что и сама страница, и
 * оставляем абсолютный адрес только для внешнего хостинга (CDN, зеркало).
 */
function downloadHref(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    const ownOrigin = parsed.origin === window.location.origin;
    const ownPath = parsed.pathname.startsWith('/downloads/');
    return ownOrigin || ownPath ? parsed.pathname + parsed.search : parsed.href;
  } catch {
    return url;
  }
}

type Verdict = 'ok' | 'warn' | 'info';

interface Check {
  label: string;
  verdict: Verdict;
  note: string;
}

interface SystemGuess {
  windows: boolean | null;
  x64: boolean | null;
}

interface UaDataLike {
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{ platform?: string; bitness?: string; architecture?: string }>;
}

/** Что можно понять о системе из браузера. null — понять нельзя. */
async function guessSystem(): Promise<SystemGuess> {
  const ua = navigator.userAgent;
  const data = (navigator as Navigator & { userAgentData?: UaDataLike }).userAgentData;
  if (data?.getHighEntropyValues) {
    try {
      const v = await data.getHighEntropyValues(['platform', 'bitness', 'architecture']);
      const windows = v.platform ? v.platform === 'Windows' : null;
      const x64 = v.bitness ? v.bitness === '64' && v.architecture !== 'arm' : null;
      return { windows, x64 };
    } catch {
      // Браузер отказал — остаёмся на строке User-Agent.
    }
  }
  const windows = /Windows/i.test(ua) ? true : /Android|iPhone|iPad|Macintosh|Linux/i.test(ua) ? false : null;
  const x64 = windows ? (/Win64|x64|WOW64/i.test(ua) ? true : null) : null;
  return { windows, x64 };
}

function checksFor(sys: SystemGuess): Check[] {
  return [
    sys.windows === true
      ? { label: 'Windows 10 или 11', verdict: 'ok', note: 'подходит' }
      : sys.windows === false
        ? { label: 'Это не Windows', verdict: 'warn', note: 'скачать можно, установить — на компьютере с Windows' }
        : { label: 'Windows 10 или 11', verdict: 'info', note: 'нужна одна из них' },
    sys.x64 === true
      ? { label: '64-битная система', verdict: 'ok', note: 'подходит' }
      : sys.x64 === false
        ? { label: '32-битная система', verdict: 'warn', note: 'нужна 64-битная Windows' }
        : { label: '64-битная система', verdict: 'info', note: 'нужна 64-битная Windows' },
    { label: 'Права администратора', verdict: 'ok', note: 'не нужны' },
    { label: 'Место на диске', verdict: 'info', note: '≈ 150 МБ' },
  ];
}

/** Шаг проверки: строки отмечаются по очереди, как в апдейтере клиента. */
const CHECK_STEP_MS = 420;

export function Download() {
  const user = useAuthStore((s) => s.user);
  const { config, loading } = useAppConfig();
  const release = config?.update.windows ?? null;

  const [checks, setChecks] = useState<Check[] | null>(null);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let alive = true;
    void guessSystem().then((sys) => {
      if (alive) setChecks(checksFor(sys));
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!checks) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setShown(checks.length);
      return;
    }
    const timers = checks.map((_, i) => window.setTimeout(() => setShown(i + 1), 380 + i * CHECK_STEP_MS));
    return () => timers.forEach(window.clearTimeout);
  }, [checks]);

  // Страница выключена в админ-панели (или закрыта для этого зрителя) — как
  // будто маршрута нет. Пока конфиг не пришёл, не рисуем ни страницу, ни 404.
  if (loading) return <div className="vx vx-page" />;
  if (!config?.windowsDownloadVisible) return <NotFound />;

  const done = checks !== null && shown >= checks.length;
  const warned = checks?.some((c) => c.verdict === 'warn') ?? false;

  return (
    <div className="vx vx-page">
      <header className="vx-top">
        <Link to="/" aria-label="Vellin — на главную">
          <VellinLockup size={26} direction="row" />
        </Link>
        <nav className="vx-top__nav" aria-label="Аккаунт">
          {user ? (
            <Link to="/library" className="vx-btn vx-btn--quiet">
              Мои комнаты
            </Link>
          ) : (
            <>
              <Link to="/login" className="vx-btn vx-btn--ghost">
                Войти
              </Link>
              <Link to="/register" className="vx-btn vx-btn--quiet">
                Создать аккаунт
              </Link>
            </>
          )}
        </nav>
      </header>

      <main>
        <section className="vx-dl vx-intro" aria-labelledby="vx-dl-title">
          <VellinMark size={60} />
          <div className="vx-dl__heading">
            <h1 id="vx-dl-title">Vellin для Windows</h1>
            <p className="vx-num">
              {release ? `Версия ${release.latestVersion} · ${INSTALLER_SIZE}` : 'Сборка готовится к публикации'}
            </p>
          </div>

          <div className="vx-check" aria-label="Проверка компьютера">
            <ul className="vx-check__list" aria-live="polite">
              {(checks ?? checksFor({ windows: null, x64: null })).map((c, i) => (
                <li key={c.label} data-state={checks && i < shown ? c.verdict : 'wait'}>
                  <Mark state={checks && i < shown ? c.verdict : 'wait'} />
                  <span className="vx-check__label">{c.label}</span>
                  <span className="vx-check__note">{checks && i < shown ? c.note : 'проверяем…'}</span>
                </li>
              ))}
            </ul>

            {release ? (
              <a
                href={downloadHref(release.url)}
                download
                className="vx-btn vx-btn--gold vx-check__cta"
                data-ready={done || undefined}
              >
                <DownloadGlyph />
                Скачать Vellin {release.latestVersion}
              </a>
            ) : (
              <button type="button" className="vx-btn vx-btn--gold vx-check__cta" disabled>
                Скоро
              </button>
            )}
            {!release && (
              <p className="vx-check__after">
                Сборка ещё не опубликована — ссылка появится здесь сама, как только выйдет.
              </p>
            )}
            {release && done && warned && (
              <p className="vx-check__after">
                Файл всё равно скачается — откройте его на компьютере с 64-битной Windows 10 или 11.
              </p>
            )}
          </div>
        </section>

        <div className="vx-flow">
          <section className="vx-section vx-split" aria-labelledby="vx-dl-facts-title">
            <div className="vx-copy">
              <h2 id="vx-dl-facts-title">Что умеет приложение</h2>
              <p>
                Программа рисует интерфейс сама, без встроенного браузера: открывается сразу, держит вход и присылает
                уведомления, даже когда окно свёрнуто.
              </p>
              <p className="vx-dl__note">{APP_NOT_YET}</p>
            </div>
            <ul className="vx-facts">
              {APP_FACTS.map((f) => (
                <li key={f.title}>
                  <b>{f.title}</b>
                  <span>{f.text}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="vx-section" aria-labelledby="vx-dl-steps-title">
            <h2 id="vx-dl-steps-title" className="vx-dl__h2">
              Установка за три шага
            </h2>
            <ol className="vx-steps">
              <li>
                <b>Скачайте установщик</b>
                <span>Один файл Vellin-Setup.exe — внутри уже всё нужное, отдельных зависимостей ставить не надо.</span>
              </li>
              <li>
                <b>Запустите его и нажмите «Установить»</b>
                <span>Установка идёт в вашу папку пользователя и не просит прав администратора.</span>
              </li>
              <li>
                <b>Войдите в аккаунт</b>
                <span>Паролем или QR-кодом с телефона — это тот же аккаунт, что и на сайте.</span>
              </li>
            </ol>
            <aside className="vx-smartscreen" aria-label="Если Windows покажет SmartScreen">
              <b>Если Windows покажет синее окно SmartScreen</b>
              <span>
                Это обычное предупреждение для новых программ без платной подписи издателя. Нажмите «Подробнее» →
                «Выполнить в любом случае». Подпись появится в одном из ближайших обновлений.
              </span>
            </aside>
          </section>

          <section className="vx-section vx-split" aria-labelledby="vx-dl-req-title">
            <div className="vx-copy">
              <h2 id="vx-dl-req-title">Требования</h2>
              <p>Обновления клиент ставит сам — проверяет новую версию при запуске.</p>
            </div>
            <dl className="vx-spec">
              <div>
                <dt>Система</dt>
                <dd>Windows 10 или 11, 64-бит</dd>
              </div>
              <div>
                <dt>Место на диске</dt>
                <dd className="vx-num">≈ 150 МБ</dd>
              </div>
              <div>
                <dt>Права администратора</dt>
                <dd>Не требуются</dd>
              </div>
              <div>
                <dt>Куда ставится</dt>
                <dd>%LOCALAPPDATA%\Vellin</dd>
              </div>
              <div>
                <dt>Удаление</dt>
                <dd>Через «Программы и компоненты»</dd>
              </div>
              {release && (
                <div>
                  <dt>Текущая версия</dt>
                  <dd className="vx-num">
                    {release.latestVersion} · {INSTALLER_SIZE}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          <section className="vx-close" aria-labelledby="vx-dl-close-title">
            <h2 id="vx-dl-close-title">Аккаунт тот же, что на сайте</h2>
            {release ? (
              <a href={downloadHref(release.url)} download className="vx-btn vx-btn--gold vx-check__cta" data-ready>
                <DownloadGlyph />
                Скачать Vellin {release.latestVersion}
              </a>
            ) : (
              <button type="button" className="vx-btn vx-btn--gold vx-check__cta" disabled>
                Скоро
              </button>
            )}
          </section>
        </div>
      </main>

      <footer className="vx-foot">
        <VellinLockup size={20} direction="row" />
        <nav aria-label="Навигация по сайту">
          <Link to="/">Главная</Link>
          {user ? <Link to="/library">Мои комнаты</Link> : <Link to="/login">Войти</Link>}
        </nav>
      </footer>
    </div>
  );
}

/** Отметка строки проверки: ждём, подходит, внимание или просто сведение. */
function Mark({ state }: { state: Verdict | 'wait' }) {
  return (
    <span className="vx-check__mark" data-state={state} aria-hidden="true">
      {state === 'ok' && (
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M2.4 6.3l2.3 2.3 4.9-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {state === 'warn' && (
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M6 2.8v4M6 9.2v.01" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )}
      {state === 'info' && (
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M6 5.4v3.4M6 3.2v.01" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )}
    </span>
  );
}
