import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { FEATURE_FLAG_REPORTS, type AdminPermission } from '@vellin/shared';
import { useAuthStore, useFeatureEnabled } from '../../stores/authStore';
import { Avatar, Button, Icon, VellinLogo, type IconName } from '../../shared';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { AdminAccessProvider, useAdminAccess } from './AdminAccessContext';
import { AdminSearchCommand } from './AdminSearchCommand';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** Право, открывающее пункт. Пункт скрыт, если права нет. */
  perm: AdminPermission;
  /** Feature-флаг, при выключении которого пункт полностью скрыт. */
  flag?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Навигация, сгруппированная по смыслу — так 13 пунктов читаются с одного взгляда. */
const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Мониторинг',
    items: [
      { to: '/admin/dashboard', label: 'Обзор', icon: 'grid', perm: 'analytics.view' },
      { to: '/admin/analytics', label: 'Аналитика', icon: 'waveform', perm: 'analytics.view' },
      { to: '/admin/geo', label: 'География', icon: 'mapPin', perm: 'analytics.view' },
    ],
  },
  {
    label: 'Модерация',
    items: [
      { to: '/admin/users', label: 'Пользователи', icon: 'users', perm: 'users.view' },
      { to: '/admin/rooms', label: 'Комнаты', icon: 'film', perm: 'rooms.view' },
      { to: '/admin/reports', label: 'Жалобы', icon: 'flame', perm: 'reports.view', flag: FEATURE_FLAG_REPORTS },
      { to: '/admin/dm', label: 'Модерация ЛС', icon: 'chat', perm: 'moderation.dm.view' },
    ],
  },
  {
    label: 'Платформа',
    items: [
      { to: '/admin/push', label: 'Push', icon: 'bell', perm: 'push.view' },
      { to: '/admin/media', label: 'Media-кэш', icon: 'cast', perm: 'media.manage' },
      { to: '/admin/system', label: 'Система', icon: 'compass', perm: 'system.view' },
      { to: '/admin/platform', label: 'Платформа', icon: 'settings', perm: 'platform.manage' },
    ],
  },
  {
    label: 'Доступ',
    items: [
      { to: '/admin/roles', label: 'Роли и доступ', icon: 'lock', perm: 'roles.manage' },
      { to: '/admin/audit', label: 'Журнал', icon: 'list', perm: 'audit.view' },
    ],
  },
];

export function AdminShell() {
  return (
    <AdminAccessProvider>
      <AdminShellInner />
    </AdminAccessProvider>
  );
}

/** Роль-индикатор: компактный пилюль с короной, а не тяжёлая полоса на всю ширину. */
function RolePill({ name }: { name: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'flex-start',
        padding: '4px 10px',
        borderRadius: 999,
        background: 'var(--accent-soft)',
        color: 'var(--accent-hi)',
        fontSize: 11.5,
        fontWeight: 600,
        letterSpacing: '0.01em',
        boxShadow: 'inset 0 0 0 1px rgba(209,39,27,0.22)',
      }}
    >
      <Icon name="crown" size={12} />
      {name}
    </span>
  );
}

function AdminShellInner() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  const navScrollerRef = useRef<HTMLElement>(null);
  const { me, loading, can } = useAdminAccess();
  const reportsEnabled = useFeatureEnabled(FEATURE_FLAG_REPORTS);

  // Мобильные вкладки: активную подводим в поле зрения при смене раздела —
  // иначе выбранный пункт может оказаться за пределами прокрутки.
  useEffect(() => {
    const el = navScrollerRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [pathname, isMobile]);

  // Пункты, доступные текущему сотруднику по его правам. Пока /admin/me грузится,
  // показываем всё — реальный барьер на сервере (403), это лишь UX. Пункты,
  // привязанные к feature-флагу, скрываем при его выключении (напр. «Жалобы»).
  const flagOn = (flag?: string) => !flag || (flag === FEATURE_FLAG_REPORTS && reportsEnabled);
  const visible = (item: NavItem) => (loading || can(item.perm)) && flagOn(item.flag);
  const groups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter(visible) }))
    .filter((g) => g.items.length > 0);
  const flatItems = groups.flatMap((g) => g.items);
  const roleName = me?.role?.name ?? (me?.isSuperAdmin ? 'Super Admin' : 'админ');

  if (isMobile) {
    return (
      <div
        style={{ minHeight: '100svh', background: 'var(--bg-0)', color: 'var(--text-0)', display: 'flex', flexDirection: 'column' }}
        className="admin-shell admin-shell--mobile"
      >
        <header
          style={{
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(var(--glass-blur))',
            WebkitBackdropFilter: 'blur(var(--glass-blur))',
            borderBottom: '1px solid var(--line-1)',
            padding: '10px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <VellinLogo />
            </Link>
            <RolePill name={roleName} />
            <Button variant="ghost" size="sm" icon="arrow" onClick={() => navigate('/library')} title="К библиотеке" />
          </div>
          <nav ref={navScrollerRef} className="admin-nav-scroller">
            {flatItems.map((item) => (
              <NavLink key={item.to} to={item.to} className="admin-nav-item admin-nav-item--compact">
                <Icon name={item.icon} size={15} className="admin-nav-icon" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </header>
        <main style={{ padding: '18px 14px 40px', minWidth: 0, flex: 1 }}>
          <Outlet />
        </main>
        <AdminSearchCommand />
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100svh',
        background: 'var(--bg-0)',
        color: 'var(--text-0)',
        display: 'grid',
        gridTemplateColumns: 'minmax(232px, 270px) 1fr',
      }}
      className="admin-shell"
    >
      <aside
        style={{
          background: 'var(--bg-1)',
          borderRight: '1px solid var(--line-1)',
          padding: '20px 16px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          position: 'sticky',
          top: 0,
          alignSelf: 'start',
          height: '100svh',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <VellinLogo />
          </Link>
          <RolePill name={roleName} />
        </div>

        <div style={{ height: 1, background: 'var(--line-1)' }} />

        <nav className="admin-nav">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="admin-nav-group">{group.label}</div>
              {group.items.map((item) => (
                <NavLink key={item.to} to={item.to} className="admin-nav-item">
                  <Icon name={item.icon} size={16} className="admin-nav-icon" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ height: 1, background: 'var(--line-1)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, padding: '2px 4px' }}>
            <Avatar name={user?.username ?? ''} seed={user?.avatarSeed ?? ''} src={user?.avatarUrl} size={34} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.username}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" icon="arrow" onClick={() => navigate('/library')}>
            К библиотеке
          </Button>
        </div>
      </aside>

      <main style={{ padding: '28px max(20px, 3vw) 60px', minWidth: 0 }}>
        <Outlet />
      </main>
      <AdminSearchCommand />
    </div>
  );
}
