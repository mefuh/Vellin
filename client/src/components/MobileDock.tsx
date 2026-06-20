import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Icon, type IconName } from '../shared';
import { useAuthStore } from '../stores/authStore';
import { useDmStore } from '../stores/dmStore';
import { useIsMobile } from '../hooks/useMediaQuery';

type TabId = 'library' | 'friends' | 'messages' | 'profile';
interface Tab {
  id: TabId;
  label: string;
  icon?: IconName;
  to: string;
}

/** Пружинистая кривая для «магического» переезда подложки. */
const SPRING = 'cubic-bezier(.22, 1, .36, 1)';

/** На каких маршрутах показываем док (оболочечные страницы). */
function shouldShow(path: string): boolean {
  if (path.startsWith('/messages/')) return false; // открытый чат — на весь экран
  return (
    path.startsWith('/library') ||
    path.startsWith('/friends') ||
    path === '/messages' ||
    path === '/profile' ||
    path.startsWith('/u/')
  );
}

/** Индекс активной вкладки по маршруту (−1 — нет активной). */
function activeIndexFromPath(path: string, myUsername: string): number {
  if (path.startsWith('/library')) return 0;
  if (path.startsWith('/friends')) return 1;
  if (path === '/messages') return 2;
  if (path === '/profile') return 3;
  if (path.startsWith('/u/')) {
    const uname = decodeURIComponent(path.slice('/u/'.length));
    return uname === myUsername ? 3 : -1;
  }
  return -1;
}

interface PillRect {
  x: number;
  w: number;
  y: number;
  h: number;
}

/**
 * Плавающий нижний док навигации (мобилка). Вынесен на уровень App и живёт
 * всё время сессии — поэтому при переходах между вкладками подложка активной
 * вкладки плавно «переезжает» (magic-move), а не появляется заново.
 */
export function MobileDock() {
  const isMobile = useIsMobile();
  const user = useAuthStore((s) => s.user);
  const dmUnread = useDmStore((s) => s.unreadTotal);
  const location = useLocation();
  const navigate = useNavigate();

  const navRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [pill, setPill] = useState<PillRect | null>(null);
  const [animate, setAnimate] = useState(false);

  const isUser = user?.kind === 'user';
  const myUsername = user?.username ?? '';
  const path = location.pathname;
  const visible = isMobile && isUser && shouldShow(path);
  const activeIndex = activeIndexFromPath(path, myUsername);

  const tabs: Tab[] = [
    { id: 'library', label: 'Библиотека', icon: 'library', to: '/library' },
    { id: 'friends', label: 'Друзья', icon: 'users', to: '/friends' },
    { id: 'messages', label: 'Чаты', icon: 'chat', to: '/messages' },
    { id: 'profile', label: 'Профиль', to: myUsername ? `/u/${encodeURIComponent(myUsername)}` : '/profile' },
  ];

  // Позиция подложки под активной вкладкой (измеряем DOM — устойчиво к гэпам/ширинам).
  useLayoutEffect(() => {
    if (activeIndex < 0) return; // нет активной — подложку гасим, не двигаем
    const el = tabRefs.current[activeIndex];
    if (!el) return;
    setPill({ x: el.offsetLeft, w: el.offsetWidth, y: el.offsetTop, h: el.offsetHeight });
  }, [activeIndex, dmUnread, isMobile, visible]);

  // Переходы включаем только после первой укладки (без прыжка из нулевой позиции).
  useEffect(() => {
    if (pill && !animate) {
      const id = requestAnimationFrame(() => setAnimate(true));
      return () => cancelAnimationFrame(id);
    }
  }, [pill, animate]);

  // Пересчёт при ресайзе окна.
  useEffect(() => {
    const onResize = (): void => {
      if (activeIndex < 0) return;
      const el = tabRefs.current[activeIndex];
      if (el) setPill({ x: el.offsetLeft, w: el.offsetWidth, y: el.offsetTop, h: el.offsetHeight });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [activeIndex]);

  if (!isMobile || !isUser) return null;

  return (
    <nav
      ref={navRef}
      aria-hidden={!visible}
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
        transform: visible ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(160%)',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        zIndex: 90,
        display: 'flex',
        alignItems: 'stretch',
        gap: 2,
        padding: 6,
        width: 'min(380px, calc(100vw - 24px))',
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)',
        WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)',
        border: '1px solid var(--glass-bd)',
        borderRadius: 999,
        boxShadow: 'var(--shadow-3)',
        transition: `transform .44s ${SPRING}, opacity .3s ease`,
      }}
    >
      {/* Скользящая подложка активной вкладки (magic-move). */}
      {pill && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: pill.y,
            height: pill.h,
            width: pill.w,
            transform: `translateX(${pill.x}px)`,
            background: 'var(--bg-4)',
            borderRadius: 22,
            zIndex: 0,
            opacity: activeIndex >= 0 ? 1 : 0,
            transition: animate
              ? `transform .42s ${SPRING}, width .42s ${SPRING}, opacity .25s ease`
              : 'opacity .25s ease',
          }}
        />
      )}

      {tabs.map((t, i) => {
        const active = i === activeIndex;
        return (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            onClick={() => navigate(t.to)}
            aria-label={t.label}
            aria-current={active ? 'page' : undefined}
            style={{
              position: 'relative',
              zIndex: 1,
              flex: '1 1 0',
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: '8px 4px 6px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontFamily: 'inherit',
              color: active ? 'var(--accent-hi)' : 'var(--text-2)',
              transition: 'color .25s ease',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span
              style={{
                position: 'relative',
                display: 'grid',
                placeItems: 'center',
                height: 24,
                transform: active ? 'translateY(-1px) scale(1.08)' : 'none',
                transition: 'transform .32s cubic-bezier(.34, 1.56, .64, 1)',
              }}
            >
              {t.icon ? (
                <Icon name={t.icon} size={22} style={{ color: active ? 'var(--accent-hi)' : 'var(--text-1)' }} />
              ) : (
                <Avatar name={user.username} seed={user.avatarSeed} src={user.avatarUrl} size={24} />
              )}
              {t.id === 'messages' && dmUnread > 0 && <DockBadge count={dmUnread} />}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: active ? 600 : 500,
                lineHeight: 1,
                letterSpacing: '-0.01em',
                whiteSpace: 'nowrap',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {t.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function DockBadge({ count }: { count: number }) {
  return (
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
      {count > 99 ? '99+' : count}
    </span>
  );
}
