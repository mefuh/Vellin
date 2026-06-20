import { Link, useNavigate } from 'react-router-dom';
import { Avatar, Button, Chip, VellinLogo, type IconName } from '../shared';
import { useAuthStore } from '../stores/authStore';
import { useDmStore } from '../stores/dmStore';
import { useIsMobile } from '../hooks/useMediaQuery';
import { NotificationsBell } from './notifications/NotificationsBell';

export type DockPage = 'library' | 'friends' | 'messages' | 'profile';

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
  const dmUnread = useDmStore((s) => s.unreadTotal);
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
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              {navBtn('messages', 'chat', 'Сообщения', '/messages')}
              {dmUnread > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: -5,
                    right: -5,
                    minWidth: 17,
                    height: 17,
                    padding: '0 4px',
                    borderRadius: 9,
                    background: 'var(--accent)',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    display: 'grid',
                    placeItems: 'center',
                    boxShadow: '0 0 0 2px var(--bg-0)',
                    pointerEvents: 'none',
                  }}
                >
                  {dmUnread > 99 ? '99+' : dmUnread}
                </span>
              )}
            </span>
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
              onClick={() => navigate(`/u/${encodeURIComponent(user.username)}`)}
              title="Мой профиль"
              aria-label="Мой профиль"
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
