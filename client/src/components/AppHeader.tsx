import { Link, useNavigate } from 'react-router-dom';
import { Avatar, Button, Chip, VellinLogo, type IconName } from '../shared';
import { useAuthStore } from '../stores/authStore';
import { useIsMobile } from '../hooks/useMediaQuery';
import { NotificationsBell } from './notifications/NotificationsBell';

export type DockPage = 'library' | 'friends' | 'profile';

/**
 * Единый верхний хедер с доком. Один и тот же набор кнопок в одних и тех же
 * позициях на всех «оболочечных» страницах (Библиотека / Друзья / Профиль /
 * чужой профиль). Активная страница подсвечивается — кнопки не прыгают, а
 * «сменяют» активное состояние при переходе. Главная и комнаты используют
 * собственные хедеры и сюда не входят.
 */
export function AppHeader({ active }: { active?: DockPage }) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const isMobile = useIsMobile();

  const activeStyle = {
    background: 'var(--accent)',
    color: '#fff',
    boxShadow: '0 1px 0 rgba(255,255,255,0.15) inset',
  } as const;
  // На мобилках кнопки только-иконки — ужимаем горизонтальные поля, чтобы
  // весь док помещался даже на узких экранах (и при наличии админ-кнопки).
  const compact = isMobile ? { paddingLeft: 8, paddingRight: 8 } : null;

  const navBtn = (page: DockPage, icon: IconName, label: string, to: string) => (
    <Button
      variant="secondary"
      size="sm"
      icon={icon}
      aria-label={label}
      title={label}
      onClick={() => navigate(to)}
      style={{ ...(active === page ? activeStyle : {}), ...compact }}
    >
      {isMobile ? '' : label}
    </Button>
  );

  return (
    <header
      style={{
        height: 72,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 max(20px, 4vw)',
        borderBottom: '1px solid var(--line-1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link to="/">
          <VellinLogo />
        </Link>
        <span
          title={`Версия ${__APP_VERSION__}`}
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-2)',
            border: '1px solid var(--line-2)',
            borderRadius: 999,
            padding: '2px 8px',
            letterSpacing: '0.02em',
            lineHeight: 1.4,
            whiteSpace: 'nowrap',
          }}
        >
          v{__APP_VERSION__}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 8 }}>
        {user?.kind === 'guest' && (
          <span style={{ color: 'var(--text-2)', fontSize: 13 }}>
            {user.username} <Chip tone="neutral">гость</Chip>
          </span>
        )}
        {user?.kind === 'user' && (
          <>
            <NotificationsBell />
            {navBtn('library', 'library', 'Библиотека', '/library')}
            {navBtn('friends', 'users', 'Друзья', '/friends')}
            {user.isAdmin && (
              <Button
                variant="secondary"
                size="sm"
                icon="crown"
                aria-label="Админ-панель"
                title="Админ-панель"
                onClick={() => navigate('/admin')}
                style={compact ?? undefined}
              >
                {isMobile ? '' : 'Админ-панель'}
              </Button>
            )}
            <button
              onClick={() => navigate('/profile')}
              title="Профиль и настройки"
              aria-label="Профиль"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-1)',
                fontSize: 13,
                padding: 0,
                fontFamily: 'inherit',
              }}
            >
              <Avatar
                name={user.username}
                seed={user.avatarSeed}
                src={user.avatarUrl}
                size={28}
                ring={active === 'profile' ? 'accent' : undefined}
              />
              {!isMobile && <span>{user.username}</span>}
            </button>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          icon="logout"
          aria-label="Выйти"
          title="Выйти"
          onClick={() => {
            logout();
            navigate('/');
          }}
          style={compact ?? undefined}
        >
          {isMobile ? '' : 'Выйти'}
        </Button>
      </div>
    </header>
  );
}
