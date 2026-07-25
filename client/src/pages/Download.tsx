import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DesktopUpdate } from '@vellin/shared';
import { Button, Chip, Icon, VellinLogo, VellinMark, type IconName } from '../shared';
import { configApi } from '../api/config';
import { useAuthStore } from '../stores/authStore';
import { useIsMobile, useMediaQuery } from '../hooks/useMediaQuery';

/**
 * Страница загрузки Windows-клиента.
 *
 * Данные о публикации (версия + ссылка на установщик) берём из того же
 * `/api/config`, откуда их читает автообновление самого приложения
 * (`update.windows`, env `WINAPP_LATEST_VERSION`/`WINAPP_DOWNLOAD_URL`) —
 * второго источника правды о «текущей версии» заводить нельзя. Пока сборка не
 * опубликована, страница честно показывает состояние «скоро».
 */

/** Примерный размер установщика — для ожиданий по трафику, не критично точный. */
const INSTALLER_SIZE = '≈ 37 МБ';

interface Feature {
  icon: IconName;
  title: string;
  text: string;
}

const FEATURES: Feature[] = [
  {
    icon: 'sparkles',
    title: 'Нативное приложение',
    text: 'Отрисовка собственным движком, без встроенного браузера и вкладок. Открывается мгновенно и не ест память как ещё один Chrome.',
  },
  {
    icon: 'lock',
    title: 'Вход по аккаунту',
    text: 'Сессия хранится на компьютере: один раз вошли — дальше приложение открывается сразу в вашем профиле.',
  },
  {
    icon: 'refresh',
    title: 'Тихое автообновление',
    text: 'Клиент сам проверяет новую версию и ставит её в фоне. Ничего скачивать вручную больше не нужно.',
  },
  {
    icon: 'user',
    title: 'Профиль и аватар',
    text: 'Личные данные, смена почты и пароля, загрузка аватара — всё то же, что в веб-версии.',
  },
];

const STEPS: { title: string; text: string }[] = [
  {
    title: 'Скачайте установщик',
    text: 'Один файл Vellin-Setup.exe — внутри уже всё нужное, отдельных зависимостей ставить не надо.',
  },
  {
    title: 'Запустите и нажмите «Установить»',
    text: 'Установка идёт в вашу папку пользователя и не просит прав администратора. Занимает несколько секунд.',
  },
  {
    title: 'Войдите в аккаунт',
    text: 'Ярлыки появятся в меню «Пуск» и на рабочем столе. Дальше — тот же аккаунт, что и на сайте.',
  },
];

const REQUIREMENTS: { label: string; value: string }[] = [
  { label: 'Система', value: 'Windows 10 или 11, 64-бит' },
  { label: 'Место на диске', value: '≈ 150 МБ' },
  { label: 'Права администратора', value: 'Не требуются' },
  { label: 'Куда ставится', value: '%LOCALAPPDATA%\\Vellin' },
  { label: 'Удаление', value: 'Через «Программы и компоненты»' },
];

export function Download() {
  const user = useAuthStore((s) => s.user);
  const isMobile = useIsMobile();
  const isNarrow = useMediaQuery('(max-width: 600px)');

  const [release, setRelease] = useState<DesktopUpdate | null>(null);
  const [loading, setLoading] = useState(true);
  // Показываем подсказку «откройте на Windows», если зашли с другой ОС —
  // ссылку при этом не прячем: файл могут скачать заранее.
  const [isWindows] = useState(() =>
    typeof navigator !== 'undefined' ? /Windows/i.test(navigator.userAgent) : true,
  );

  useEffect(() => {
    const ac = new AbortController();
    configApi
      .get(ac.signal)
      .then((cfg) => setRelease(cfg.update.windows))
      .catch(() => setRelease(null))
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, []);

  const card: React.CSSProperties = {
    background: 'var(--bg-2)',
    border: '1px solid var(--line-2)',
    borderRadius: 'var(--r-xl)',
    padding: isNarrow ? 16 : 20,
  };

  return (
    <div
      style={{
        minHeight: '100svh',
        background:
          'radial-gradient(1200px 600px at 80% -20%, var(--accent-soft), transparent 60%), var(--bg-0)',
        color: 'var(--text-0)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          minHeight: 72,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px max(16px, 4vw)',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <Link to="/" style={{ textDecoration: 'none' }}>
          <VellinLogo />
        </Link>
        <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {user ? (
            <Link to="/library">
              <Button variant="secondary" size="md" iconRight="arrow">
                В библиотеку
              </Button>
            </Link>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost" size="md">
                  Войти
                </Button>
              </Link>
              <Link to="/register">
                <Button variant="secondary" size="md">
                  Создать аккаунт
                </Button>
              </Link>
            </>
          )}
        </nav>
      </header>

      <main
        style={{
          flex: 1,
          width: '100%',
          maxWidth: 1180,
          margin: '0 auto',
          padding: isMobile ? '16px max(16px, 4vw) 56px' : '32px max(16px, 4vw) 80px',
          display: 'flex',
          flexDirection: 'column',
          gap: isMobile ? 48 : 72,
        }}
      >
        {/* ── Герой: слева оффер и кнопка, справа макет окна приложения ── */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.05fr) minmax(0, 1fr)',
            gap: isMobile ? 32 : 48,
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 600 }}>
            <Chip tone="accent" icon="sparkles" style={{ alignSelf: 'flex-start' }}>
              Windows · beta{release ? ` v ${release.latestVersion}` : ''}
            </Chip>
            <h1
              style={{
                fontSize: 'clamp(34px, 4.6vw, 56px)',
                lineHeight: 1.06,
                fontWeight: 600,
                letterSpacing: '-0.03em',
                margin: 0,
              }}
            >
              Vellin для
              <br />
              <span style={{ color: 'var(--accent-hi)' }}>Windows.</span>
            </h1>
            <p
              style={{
                fontSize: 18,
                color: 'var(--text-1)',
                lineHeight: 1.5,
                margin: 0,
                maxWidth: 520,
              }}
            >
              Настольное приложение вместо вкладки в браузере: свой аккаунт, профиль и вход в пару
              секунд. Ставится без прав администратора и обновляется само.
            </p>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {release ? (
                <a href={release.url} download style={{ textDecoration: 'none' }}>
                  <Button variant="primary" size="lg" icon="download">
                    Скачать для Windows
                  </Button>
                </a>
              ) : (
                <Button variant="primary" size="lg" icon="download" disabled>
                  {loading ? 'Загружаем…' : 'Скоро'}
                </Button>
              )}
              <Link to={user ? '/library' : '/register'} style={{ textDecoration: 'none' }}>
                <Button variant="glass" size="lg" icon="globe">
                  Остаться в браузере
                </Button>
              </Link>
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '10px 20px',
                color: 'var(--text-2)',
                fontSize: 13,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="check" size={14} /> {INSTALLER_SIZE}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="check" size={14} /> Windows 10/11, 64-бит
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="check" size={14} /> Без прав администратора
              </span>
            </div>

            {!loading && !release && (
              <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 13, lineHeight: 1.5 }}>
                Сборка ещё не опубликована. Загляните чуть позже — ссылка появится здесь
                автоматически.
              </p>
            )}
            {!isWindows && release && (
              <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 13, lineHeight: 1.5 }}>
                Похоже, вы не на Windows. Файл всё равно скачается — просто откройте эту страницу
                на нужном компьютере, когда будете готовы установить.
              </p>
            )}
          </div>

          {/* Макет окна приложения — не скриншот, а стилизованный кадр в фирменной палитре. */}
          <div
            style={{
              borderRadius: 'var(--r-2xl)',
              overflow: 'hidden',
              border: '1px solid var(--line-2)',
              boxShadow: 'var(--shadow-3)',
              background: 'var(--bg-2)',
            }}
          >
            <div
              style={{
                height: 38,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '0 12px',
                background: 'var(--bg-3)',
                borderBottom: '1px solid var(--line-2)',
              }}
            >
              <span style={{ display: 'flex', gap: 6 }}>
                {['var(--line-2)', 'var(--line-2)', 'var(--accent)'].map((c, i) => (
                  <span
                    key={i}
                    style={{ width: 9, height: 9, borderRadius: '50%', background: c }}
                  />
                ))}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-2)', letterSpacing: '-0.01em' }}>
                Vellin — рабочий стол
              </span>
            </div>
            {/* Содержимое кадра намеренно повторяет то, что в клиенте уже есть
                (профиль и вход), а не комнаты — их в приложении пока нет. */}
            <div
              style={{
                aspectRatio: '16 / 10',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 14,
                padding: isNarrow ? 16 : 24,
                background:
                  'radial-gradient(420px 220px at 50% 0%, var(--accent-soft), transparent 70%), var(--bg-1)',
              }}
            >
              <VellinMark size={56} />
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.02em' }}>
                  С возвращением
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                  Сессия сохранена на этом компьютере
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Chip tone="success" icon="check">
                  Вход выполнен
                </Chip>
                <Chip tone="neutral" icon="user">
                  Профиль
                </Chip>
                <Chip tone="neutral" icon="refresh">
                  Обновлено
                </Chip>
              </div>
            </div>
          </div>
        </section>

        {/* ── Возможности ── */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 'clamp(24px, 2.6vw, 32px)',
              fontWeight: 600,
              letterSpacing: '-0.02em',
            }}
          >
            Что умеет приложение
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile
                ? '1fr'
                : 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: 16,
            }}
          >
            {FEATURES.map((f) => (
              <div key={f.title} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 'var(--r-md)',
                    background: 'var(--accent-soft)',
                    color: 'var(--accent-hi)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name={f.icon} size={18} />
                </span>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>
                  {f.title}
                </h3>
                <p style={{ margin: 0, color: 'var(--text-1)', fontSize: 14, lineHeight: 1.5 }}>
                  {f.text}
                </p>
              </div>
            ))}
          </div>
          <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 13, lineHeight: 1.5 }}>
            Комнаты и совместный просмотр пока живут в веб-версии — в приложении они появятся
            следующими. Аккаунт общий, ничего переносить не придётся.
          </p>
        </section>

        {/* ── Установка ── */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 'clamp(24px, 2.6vw, 32px)',
              fontWeight: 600,
              letterSpacing: '-0.02em',
            }}
          >
            Установка за три шага
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
              gap: 16,
            }}
          >
            {STEPS.map((s, i) => (
              <div key={s.title} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span
                  style={{
                    fontSize: 28,
                    fontWeight: 600,
                    letterSpacing: '-0.03em',
                    color: 'var(--accent-hi)',
                    lineHeight: 1,
                  }}
                >
                  {i + 1}
                </span>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>
                  {s.title}
                </h3>
                <p style={{ margin: 0, color: 'var(--text-1)', fontSize: 14, lineHeight: 1.5 }}>
                  {s.text}
                </p>
              </div>
            ))}
          </div>

          {/* Предупреждение SmartScreen — самая частая причина «не устанавливается». */}
          <div
            style={{
              ...card,
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
              background: 'var(--accent-soft)',
              border: '1px solid rgba(209,39,27,0.2)',
            }}
          >
            <span style={{ color: 'var(--accent-hi)', flexShrink: 0, marginTop: 2 }}>
              <Icon name="lock" size={18} />
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <strong style={{ fontSize: 15, fontWeight: 600 }}>
                Если Windows покажет синее окно SmartScreen
              </strong>
              <p style={{ margin: 0, color: 'var(--text-1)', fontSize: 14, lineHeight: 1.5 }}>
                Это обычное предупреждение для новых программ без платной подписи издателя.
                Нажмите «Подробнее» → «Выполнить в любом случае». Подпись мы добавим в одном из
                ближайших обновлений.
              </p>
            </div>
          </div>
        </section>

        {/* ── Требования ── */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 'clamp(24px, 2.6vw, 32px)',
              fontWeight: 600,
              letterSpacing: '-0.02em',
            }}
          >
            Требования
          </h2>
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            {REQUIREMENTS.map((r, i) => (
              <div
                key={r.label}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  justifyContent: 'space-between',
                  padding: isNarrow ? '12px 16px' : '14px 20px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--line-2)',
                  fontSize: 14,
                }}
              >
                <span style={{ color: 'var(--text-2)' }}>{r.label}</span>
                <span style={{ color: 'var(--text-0)' }}>{r.value}</span>
              </div>
            ))}
            {release && (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  justifyContent: 'space-between',
                  padding: isNarrow ? '12px 16px' : '14px 20px',
                  borderTop: '1px solid var(--line-2)',
                  fontSize: 14,
                }}
              >
                <span style={{ color: 'var(--text-2)' }}>Текущая версия</span>
                <span style={{ color: 'var(--text-0)' }}>
                  {release.latestVersion} · {INSTALLER_SIZE}
                </span>
              </div>
            )}
          </div>
        </section>

        {/* ── Финальный призыв ── */}
        <section
          style={{
            ...card,
            padding: isMobile ? 24 : 32,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 20,
            alignItems: 'center',
            justifyContent: 'space-between',
            background:
              'linear-gradient(120deg, var(--accent-soft), transparent 60%), var(--bg-2)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 520 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 'clamp(20px, 2.2vw, 26px)',
                fontWeight: 600,
                letterSpacing: '-0.02em',
              }}
            >
              Готовы попробовать?
            </h2>
            <p style={{ margin: 0, color: 'var(--text-1)', fontSize: 15, lineHeight: 1.5 }}>
              Скачивание бесплатное, аккаунт — тот же, что на сайте.
            </p>
          </div>
          {release ? (
            <a href={release.url} download style={{ textDecoration: 'none' }}>
              <Button variant="primary" size="lg" icon="download">
                Скачать Vellin {release.latestVersion}
              </Button>
            </a>
          ) : (
            <Button variant="primary" size="lg" icon="download" disabled>
              {loading ? 'Загружаем…' : 'Скоро'}
            </Button>
          )}
        </section>
      </main>
    </div>
  );
}
