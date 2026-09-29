import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useAppConfig } from '../hooks/useAppConfig';
import { AppFactsSection, AppHero } from '../landing/AppLanding';
import { LinkField, SourceMarquee } from '../landing/LinkField';
import { RoomDemo } from '../landing/RoomDemo';
import { SyncDemo } from '../landing/SyncDemo';
import { VellinLockup } from '../landing/VellinMark';
import type { VideoSource } from '../landing/sources';
import '../landing/vx.css';
import '../landing/landing.css';

/**
 * Главная на визуальном языке клиента для Windows. Два варианта — какой
 * показать, решает админ-панель (раздел Windows → «Главная страница»), а
 * сервер отдаёт итог в `landingMode`:
 *
 * - `watch` — только совместный просмотр: первый экран — поле ссылки;
 * - `watchApp` — сначала клиент для Windows, за ним тот же просмотр.
 *
 * Часть про просмотр одна на оба варианта (WatchFlow), чтобы они не
 * расходились в словах и фактах.
 */
export function Landing() {
  const user = useAuthStore((s) => s.user);
  const { config, loading } = useAppConfig();
  const [source, setSource] = useState<VideoSource | null>(null);
  const withApp = config?.landingMode === 'watchApp';

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

      {/* Пока не пришёл конфиг, первый экран не рисуем: иначе на мгновение
          мелькнул бы не тот вариант главной. Фон и шапка уже на месте. */}
      {!loading && (
        <main>
          {withApp ? (
            <>
              <AppHero />
              <div className="vx-flow">
                <AppFactsSection />
                <section id="watch" className="vx-watchhead" aria-labelledby="vx-watch-title">
                  <h2 id="vx-watch-title">А смотреть вместе можно прямо в браузере</h2>
                  <p className="vx-hero__lead">
                    Вставьте ссылку — и все, кто в комнате, увидят один и тот же кадр в одну и ту же секунду.
                  </p>
                  <div className="vx-hero__form">
                    <LinkField onSourceChange={setSource} />
                    <SourceMarquee active={source} />
                  </div>
                </section>
                <WatchFlow />
              </div>
            </>
          ) : (
            <>
              <section className="vx-hero vx-intro" aria-labelledby="vx-hero-title">
                <VellinLockup size={72} />
                <h1 id="vx-hero-title" className="vx-hero__title">
                  Одно видео. Один кадр.
                  <br />
                  <em>Вместе.</em>
                </h1>
                <p className="vx-hero__lead">
                  Вставьте ссылку — и все, кто в комнате, увидят один и тот же кадр в одну и ту же секунду. С
                  голосом, чатом и реакциями поверх.
                </p>
                <div className="vx-hero__form">
                  <LinkField onSourceChange={setSource} />
                  <SourceMarquee active={source} />
                </div>
              </section>
              <div className="vx-flow">
                <WatchFlow />
              </div>
            </>
          )}
        </main>
      )}

      <footer className="vx-foot">
        <VellinLockup size={20} direction="row" />
        <nav aria-label="Навигация по сайту">
          {withApp && <Link to="/download">Для Windows</Link>}
          {user ? (
            <Link to="/library">Мои комнаты</Link>
          ) : (
            <>
              <Link to="/login">Войти</Link>
              <Link to="/register">Создать аккаунт</Link>
            </>
          )}
        </nav>
      </footer>
    </div>
  );
}

/** Совместный просмотр: синхрон, комната, источники и финальный призыв. */
function WatchFlow() {
  return (
    <>
      <section className="vx-section vx-split" aria-labelledby="vx-sync-title">
        <div className="vx-copy">
          <h2 id="vx-sync-title">Кадр в кадр, а не «примерно вместе»</h2>
          <p>
            Позицию воспроизведения держит сервер — одну на всю комнату. Пауза, перемотка и смена видео доходят
            до всех разом, а кто отстал, тот незаметно догоняет.
          </p>
          <ul className="vx-facts">
            <li>
              <b>Меньше 0,4 с</b>
              <span>расхождения между участниками — дальше плеер его просто не допускает.</span>
            </li>
            <li>
              <b>До 2 секунд</b>
              <span>отставания выравниваются скоростью воспроизведения, без рывка картинки.</span>
            </li>
            <li>
              <b>Обрыв связи</b>
              <span>не страшен: после переподключения вы сразу на той же секунде, что и все.</span>
            </li>
          </ul>
        </div>
        <div>
          <SyncDemo />
        </div>
      </section>

      <section className="vx-section vx-split vx-split--flip" aria-labelledby="vx-room-title">
        <div>
          <RoomDemo />
        </div>
        <div className="vx-copy">
          <h2 id="vx-room-title">Комната, в которой хочется остаться</h2>
          <ul className="vx-facts">
            <li>
              <b>Голос</b>
              <span>разговаривайте прямо во время просмотра.</span>
            </li>
            <li>
              <b>Чат</b>
              <span>для тех, кто пишет, а не говорит.</span>
            </li>
            <li>
              <b>Реакции</b>
              <span>взлетают поверх кадра у всех одновременно.</span>
            </li>
            <li>
              <b>Плейлист</b>
              <span>следующая серия уже стоит в очереди.</span>
            </li>
          </ul>
        </div>
      </section>

      <section className="vx-section vx-sources" aria-labelledby="vx-sources-title">
        <h2 id="vx-sources-title">Где бы ни лежало видео</h2>
        <p className="vx-sources__list">
          <b>YouTube</b>, <b>RuTube</b>, <b>VK Видео</b>, <b>Vimeo</b>, прямые <b>MP4</b> и <b>WebM</b>, потоки{' '}
          <b>HLS</b> и <b>DASH</b>, <b>торренты</b> и magnet-ссылки — и ещё около тысячи сайтов.
        </p>
        <p className="vx-sources__note">
          Плеер один для всех источников: видео открывается у всех одинаково, без чужих встроенных плееров.
        </p>
      </section>

      <section className="vx-close" aria-labelledby="vx-close-title">
        <h2 id="vx-close-title">Вставьте ссылку — остальное Vellin сделает сам</h2>
        <LinkField size="md" />
      </section>
    </>
  );
}
