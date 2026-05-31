import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Avatar, Icon, type IconName } from '../shared';
import { useAuthStore } from '../stores/authStore';
import { useIsMobile } from '../hooks/useMediaQuery';
import { AppHeader } from '../components/AppHeader';
import { AvatarSection } from '../components/profile/AvatarSection';
import { IdentitySection } from '../components/profile/IdentitySection';
import { EmailSection } from '../components/profile/EmailSection';
import { PasswordSection } from '../components/profile/PasswordSection';
import { DevicesSection } from '../components/profile/DevicesSection';
import type { AuthUser } from '@vellin/shared';

type TabId = 'profile' | 'email' | 'password' | 'devices';

const NAV: { id: TabId; icon: IconName; label: string }[] = [
  { id: 'profile', icon: 'user', label: 'Профиль' },
  { id: 'email', icon: 'globe', label: 'Email' },
  { id: 'password', icon: 'lock', label: 'Пароль' },
  { id: 'devices', icon: 'cast', label: 'Устройства' },
];

function renderTab(tab: TabId, user: AuthUser) {
  switch (tab) {
    case 'profile':
      return (
        <>
          <AvatarSection user={user} />
          <IdentitySection user={user} />
        </>
      );
    case 'email':
      return <EmailSection user={user} />;
    case 'password':
      return <PasswordSection />;
    case 'devices':
      return <DevicesSection />;
  }
}

export function Profile() {
  const user = useAuthStore((s) => s.user);
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<TabId>('profile');

  // Гостям профиль недоступен — у них нет постоянного аккаунта.
  if (user && user.kind === 'guest') return <Navigate to="/library" replace />;
  if (!user) return <Navigate to="/login" replace />;

  const header = <AppHeader active="profile" />;

  // ── Мобильная версия: всё стопкой (не трогаем) ─────────────────────────
  if (isMobile) {
    return (
      <div style={{ minHeight: '100svh', background: 'var(--bg-0)', color: 'var(--text-0)' }}>
        {header}
        <main
          style={{
            padding: '20px 14px 64px',
            maxWidth: 760,
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div>
            <h1 style={{ fontSize: 24, margin: 0, fontWeight: 600, letterSpacing: '-0.02em' }}>
              Профиль и настройки
            </h1>
            <p style={{ marginTop: 6, color: 'var(--text-2)', fontSize: 14 }}>
              Управление аккаунтом, безопасностью и устройствами.
            </p>
          </div>
          <AvatarSection user={user} />
          <IdentitySection user={user} />
          <EmailSection user={user} />
          <PasswordSection />
          <DevicesSection />
        </main>
      </div>
    );
  }

  // ── Десктоп: сайдбар с разделами + контент ─────────────────────────────
  const active = NAV.find((n) => n.id === tab)!;
  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg-0)', color: 'var(--text-0)' }}>
      {header}
      <div
        style={{
          maxWidth: 1120,
          margin: '0 auto',
          padding: '36px max(24px, 4vw) 80px',
          display: 'grid',
          gridTemplateColumns: '260px minmax(0, 1fr)',
          gap: 40,
          alignItems: 'start',
        }}
      >
        {/* Сайдбар */}
        <aside style={{ position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: 14,
              background: 'var(--bg-1)',
              border: '1px solid var(--line-1)',
              borderRadius: 'var(--r-lg)',
            }}
          >
            <Avatar name={user.username} seed={user.avatarSeed} src={user.avatarUrl} size={44} />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {user.username}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--text-2)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {user.email}
              </div>
            </div>
          </div>

          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {NAV.map((n) => {
              const isActive = n.id === tab;
              return (
                <button
                  key={n.id}
                  onClick={() => setTab(n.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 11,
                    padding: '9px 12px',
                    borderRadius: 'var(--r-md)',
                    cursor: 'pointer',
                    border: 'none',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    fontSize: 14,
                    background: isActive ? 'var(--bg-3)' : 'transparent',
                    color: isActive ? 'var(--text-0)' : 'var(--text-1)',
                    transition: 'background .12s, color .12s',
                  }}
                >
                  <Icon name={n.icon} size={16} />
                  {n.label}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Контент активного раздела */}
        <main style={{ minWidth: 0, maxWidth: 720 }}>
          <div style={{ marginBottom: 22 }}>
            <h1 style={{ fontSize: 28, margin: 0, fontWeight: 600, letterSpacing: '-0.02em' }}>{active.label}</h1>
            <p style={{ marginTop: 6, color: 'var(--text-2)', fontSize: 14 }}>
              {tab === 'profile' && 'Аватар, имя пользователя и информация о себе.'}
              {tab === 'email' && 'Смена адреса электронной почты.'}
              {tab === 'password' && 'Обновление пароля и безопасность входа.'}
              {tab === 'devices' && 'Активные сессии и выход с устройств.'}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>{renderTab(tab, user)}</div>
        </main>
      </div>
    </div>
  );
}
