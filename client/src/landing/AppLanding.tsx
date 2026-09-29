import { Link } from 'react-router-dom';
import { AppWindows } from './AppWindows';
import { APP_FACTS, APP_NOT_YET } from './appFacts';
import { VellinMark } from './VellinMark';
import './appwin.css';

/**
 * Первая половина главной в режиме «+ приложение»: клиент для Windows.
 *
 * Сначала само приложение — три его окна веером, — потом что оно умеет.
 * Совместный просмотр идёт следом той же частью, что на обычной главной,
 * поэтому кнопка «Смотреть в браузере» ведёт вниз, к полю ссылки.
 */
export function AppHero() {
  return (
    <section className="vx-apphero vx-intro" aria-labelledby="vx-app-title">
      <VellinMark size={56} />
      <h1 id="vx-app-title" className="vx-hero__title">
        Vellin теперь
        <br />
        <em>на Windows.</em>
      </h1>
      <p className="vx-hero__lead">
        Сообщения, звонки и друзья — в отдельной программе, которая живёт рядом с другими окнами и не теряется
        среди вкладок.
      </p>
      <div className="vx-apphero__actions">
        <Link to="/download" className="vx-btn vx-btn--gold vx-apphero__cta">
          <DownloadGlyph />
          Скачать для Windows
        </Link>
        <a href="#watch" className="vx-btn vx-btn--quiet vx-apphero__cta">
          Смотреть в браузере
        </a>
      </div>
      <AppWindows />
    </section>
  );
}

export function AppFactsSection() {
  return (
    <section className="vx-section vx-split" aria-labelledby="vx-appfacts-title">
      <div className="vx-copy">
        <h2 id="vx-appfacts-title">Программа, а не ещё одна вкладка</h2>
        <p>
          Клиент рисует интерфейс сам, без встроенного браузера: открывается сразу, держит вход и присылает
          уведомления, даже когда окно свёрнуто.
        </p>
        <p className="vx-appfacts__note">{APP_NOT_YET}</p>
      </div>
      <div className="vx-copy">
        <ul className="vx-facts">
          {APP_FACTS.map((f) => (
            <li key={f.title}>
              <b>{f.title}</b>
              <span>{f.text}</span>
            </li>
          ))}
        </ul>
        <Link to="/download" className="vx-btn vx-btn--gold vx-appfacts__cta">
          <DownloadGlyph />
          Скачать для Windows
        </Link>
      </div>
    </section>
  );
}

export function DownloadGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M9 2.8v8.4M5.6 8.4L9 11.8l3.4-3.4M3.4 14.6h11.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
