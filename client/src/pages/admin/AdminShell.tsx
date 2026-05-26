import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { Button, Chip, Icon, VellinLogo, type IconName } from '../../shared';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
}

const NAV: NavItem[] = [
  { to: '/admin/dashboard', label: 'Обзор', icon: 'grid' },
  { to: '/admin/users', label: 'Пользователи', icon: 'users' },
  { to: '/admin/rooms', label: 'Комнаты', icon: 'film' },
];

export function AdminShell() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  return (
    <div
      style={{
        minHeight: '100svh',
        background: 'var(--bg-0)',
        color: 'var(--text-0)',
        display: 'grid',
        gridTemplateColumns: 'minmax(220px, 260px) 1fr',
      }}
      className="admin-shell"
    >
      <aside
        style={{
          background: 'var(--bg-1)',
          borderRight: '1px solid var(--line-2)',
          padding: '20px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          position: 'sticky',
          top: 0,
          alignSelf: 'start',
          height: '100svh',
        }}
      >
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <VellinLogo />
        </Link>
        <Chip tone="accent" icon="crown">админ-панель</Chip>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 'var(--r-md)',
                color: isActive ? 'var(--text-0)' : 'var(--text-1)',
                background: isActive ? 'var(--bg-3)' : 'transparent',
                boxShadow: isActive ? 'inset 0 0 0 1px var(--line-2)' : 'none',
                fontSize: 14,
                fontWeight: 500,
                textDecoration: 'none',
                transition: 'background .12s',
              })}
            >
              <Icon name={item.icon} size={16} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--r-md)',
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
