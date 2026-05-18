import { Link } from 'react-router-dom';
import { Button, Chip, MountainPoster, VellinLogo } from '../shared';
import { Icon } from '../shared/Icon';
import { useAuthStore } from '../stores/authStore';
import { useIsMobile } from '../hooks/useMediaQuery';

export function Landing() {
  const user = useAuthStore((s) => s.user);
  const isMobile = useIsMobile();

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
        <VellinLogo />
        <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {user ? (
            <Link to="/library">
              <Button variant="primary" size="md" iconRight="arrow">
                Открыть библиотеку
              </Button>
            </Link>
          ) : (
            <>
              <Link to="/guest">
                <Button variant="ghost" size="md">
                  Гостем
                </Button>
              </Link>
              <Link to="/login">
                <Button variant="secondary" size="md">
                  Войти
                </Button>
              </Link>
              <Link to="/register">
                <Button variant="primary" size="md" iconRight="arrow">
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
          padding: isMobile ? '24px max(16px, 4vw) 48px' : '40px max(24px, 5vw) 80px',
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.05fr) minmax(0, 1fr)',
          gap: isMobile ? 28 : 48,
          alignItems: 'center',
        }}
      >
        <section style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Chip tone="accent" icon="sparkles" style={{ alignSelf: 'flex-start' }}>
            beta v 0.1.0 · создан для просмотра Универа
          </Chip>
          <h1
            style={{
              fontSize: 'clamp(40px, 5vw, 64px)',
              lineHeight: 1.05,
              fontWeight: 600,
              letterSpacing: '-0.03em',
              margin: 0,
            }}
          >
            Кино, которое смотрят
            <br />
            <span style={{ color: 'var(--accent-hi)' }}>вместе.</span>
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
            Vellin синхронизирует видео по любой ссылке между всеми участниками комнаты с
            точностью до кадра. Гостевой вход, чат, реакции — без установок.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link to={user ? '/library' : '/register'}>
              <Button variant="primary" size="lg" icon="plus">
                {user ? 'Перейти к комнатам' : 'Создать комнату'}
              </Button>
            </Link>
            <Link to="/guest">
              <Button variant="glass" size="lg" icon="users">
                Войти гостем
              </Button>
            </Link>
          </div>
          <div style={{ display: 'flex', gap: 24, marginTop: 12, color: 'var(--text-2)', fontSize: 13 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="check" size={14} /> Heartbeat sync 5с
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="check" size={14} /> Reconnect
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="check" size={14} /> Реакции и чат
            </span>
          </div>
        </section>

        <section
          style={{
            borderRadius: 'var(--r-2xl)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-3)',
            border: '1px solid var(--line-2)',
            aspectRatio: '16 / 10',
            background: 'var(--bg-2)',
            position: 'relative',
          }}
        >
          <MountainPoster seed={0} />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'flex-end',
              padding: 24,
              background: 'linear-gradient(to top, rgba(0,0,0,0.65), transparent 55%)',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <Chip tone="live">LIVE · 4 участника</Chip>
            <Chip tone="neutral" icon="film">
              Big Buck Bunny
            </Chip>
            <Chip tone="success" icon="check">
              в синхроне
            </Chip>
          </div>
        </section>
      </main>
    </div>
  );
}
