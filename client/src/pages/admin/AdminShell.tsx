import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import type { AdminPermission } from '@vellin/shared';
import { useAuthStore } from '../../stores/authStore';
import { Button, Chip, Icon, VellinLogo, type IconName } from '../../shared';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { AdminAccessProvider, useAdminAccess } from './AdminAccessContext';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** Право, открывающее пункт. Пункт скрыт, если права нет. */
  perm: AdminPermission;
}

const NAV: NavItem[] = [
  { to: '/admin/dashboard', label: 'Обзор', icon: 'grid', perm: 'analytics.view' },
  { to: '/admin/analytics', label: 'Аналитика', icon: 'waveform', perm: 'analytics.view' },
  { to: '/admin/users', label: 'Пользователи', icon: 'users', perm: 'users.view' },
  { to: '/admin/rooms', label: 'Комнаты', icon: 'film', perm: 'rooms.view' },
  { to: '/admin/reports', label: 'Жалобы', icon: 'flame', perm: 'reports.view' },
  { to: '/admin/dm', label: 'Модерация ЛС', icon: 'chat', perm: 'moderation.dm.view' },
  { to: '/admin/push', label: 'Push', icon: 'bell', perm: 'push.view' },
  { to: '/admin/system', label: 'Система', icon: 'cast', perm: 'system.view' },
  { to: '/admin/platform', label: 'Платформа', icon: 'settings', perm: 'platform.manage' },
  { to: '/admin/roles', label: 'Роли и доступ', icon: 'lock', perm: 'roles.manage' },
  { to: '/admin/audit', label: 'Журнал', icon: 'list', perm: 'audit.view' },
];

export function AdminShell() {
  return (
    <AdminAccessProvider>
      <AdminShellInner />
    </AdminAccessProvider>
  );
}

function AdminShellInner() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isMobile = useIsMobile();
  const { me, loading, can } = useAdminAccess();

  // Пункты, доступные текущему сотруднику по его правам. Пока /admin/me грузится,
  // показываем всё — реальный барьер на сервере (403), это лишь UX.
  const items = loading ? NAV : NAV.filter((n) => can(n.perm));
  const roleName = me?.role?.name ?? (me?.isSuperAdmin ? 'Super Admin' : 'админ');

  const navLinkStyle = (isActive: boolean, compact: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: compact ? ('center' as const) : ('flex-start' as const),
    gap: compact ? 6 : 10,
    padding: compact ? '8px 6px' : '10px 12px',
    borderRadius: 999,
    color: isActive ? 'var(--text-0)' : 'var(--text-2)',
    background: isActive ? 'var(--bg-3)' : 'transparent',
    boxShadow: isActive ? 'inset 0 0 0 1px var(--line-2)' : 'none',
    fontSize: compact ? 13 : 14,
    fontWeight: 500,
    textDecoration: 'none',
    transition: 'background .14s, color .14s',
  });

  if (isMobile) {
    return (
      <div
        style={{
          minHeight: '100svh',
          background: 'var(--bg-0)',
          color: 'var(--text-0)',
          display: 'flex',
          flexDirection: 'column',
        }}
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
            <Chip tone="accent" icon="crown">{roleName}</Chip>
            <Button variant="ghost" size="sm" icon="arrow" onClick={() => navigate('/library')} title="К библиотеке" />
          </div>
          <nav style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2 }}>
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} style={({ isActive }) => ({ ...navLinkStyle(isActive, true), flex: '0 0 auto', whiteSpace: 'nowrap' })}>
                <Icon name={item.icon} size={15} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </header>
        <main style={{ padding: '18px 14px 40px', minWidth: 0, flex: 1 }}>
          <Outlet />
        </main>
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
        gridTemplateColumns: 'minmax(230px, 268px) 1fr',
      }}
      className="admin-shell"
    >
      <aside
        style={{
          background: 'var(--bg-1)',
          borderRight: '1px solid var(--line-1)',
          padding: '22px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          position: 'sticky',
          top: 0,
          alignSelf: 'start',
          height: '100svh',
        }}
      >
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <VellinLogo />
        </Link>
        <Chip tone="accent" icon="crown">{roleName}</Chip>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} style={({ isActive }) => navLinkStyle(isActive, false)}>
              <Icon name={item.icon} size={16} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--r-lg)',
              background: 'var(--bg-2)',
              boxShadow: 'inset 0 0 0 1px var(--line-1)',
              fontSize: 12,
              color: 'var(--text-2)',
            }}
          >
            <div style={{ color: 'var(--text-1)' }}>{user?.username}</div>
            <div style={{ fontSize: 11, opacity: 0.75 }}>{user?.email}</div>
          </div>
          <Button variant="ghost" size="sm" icon="arrow" onClick={() => navigate('/library')}>
            К библиотеке
          </Button>
        </div>
      </aside>

      <main style={{ padding: '28px max(20px, 3vw) 60px', minWidth: 0 }}>
        <Outlet />
      </main>
    </div>
  );
}
