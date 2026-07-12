import { useState, type CSSProperties } from 'react';
import { Navigate } from 'react-router-dom';
import type { AuthUser } from '@vellin/shared';
import { useAuthStore } from '../stores/authStore';
import { useIsMobile } from '../hooks/useMediaQuery';
import { AppHeader } from '../components/AppHeader';
import { HeroShell } from '../components/profile/ProfileHeroKit';
import { SettingsHero } from '../components/profile/SettingsHero';
import { IdentitySection } from '../components/profile/IdentitySection';
import { FavoritesSection } from '../components/profile/FavoritesSection';
import { PrivacySection } from '../components/profile/PrivacySection';
import { EmailSection } from '../components/profile/EmailSection';
import { PasswordSection } from '../components/profile/PasswordSection';
import { DevicesSection } from '../components/profile/DevicesSection';

type TabId = 'profile' | 'cinema' | 'privacy' | 'email' | 'password' | 'devices';

const TABS: { id: TabId; label: string }[] = [
  { id: 'profile', label: 'Профиль' },
  { id: 'cinema', label: 'Кино' },
  { id: 'privacy', label: 'Приватность' },
  { id: 'email', label: 'Email' },
  { id: 'password', label: 'Пароль' },
  { id: 'devices', label: 'Устройства' },
];

function renderTab(tab: TabId, user: AuthUser) {
  switch (tab) {
    case 'profile':
      return <IdentitySection user={user} />;
    case 'cinema':
      return <FavoritesSection />;
    case 'privacy':
      return <PrivacySection />;
    case 'email':
      return <EmailSection user={user} />;
    case 'password':
      return <PasswordSection />;
    case 'devices':
      return <DevicesSection />;
  }
}

const tabBase: CSSProperties = {
  fontFamily: 'inherit',
  fontSize: 13.5,
  fontWeight: 600,
  padding: '9px 16px',
  borderRadius: 999,
  border: 'none',
  cursor: 'pointer',
  transition: 'background .2s, color .2s',
  whiteSpace: 'nowrap',
  background: 'transparent',
  color: 'var(--text-2)',
};

export function Profile() {
  const user = useAuthStore((s) => s.user);
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<TabId>('profile');

  // Гостям профиль недоступен — у них нет постоянного аккаунта.
  if (user && user.kind === 'guest') return <Navigate to="/library" replace />;
  if (!user) return <Navigate to="/login" replace />;

  const body = (
    <HeroShell glowColor="var(--ok)" maxWidth={840}>
      <div style={{ paddingBottom: isMobile ? 120 : 96 }}>
        <SettingsHero user={user} />

        {/* Липкая таб-навигация. */}
        <div
          style={{
            position: 'sticky',
            top: 14,
            zIndex: 40,
            marginTop: isMobile ? 34 : 44,
            display: 'flex',
            justifyContent: isMobile ? 'center' : 'flex-start',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 4,
              padding: 5,
              borderRadius: 16,
              background: 'var(--glass-bg)',
              backdropFilter: 'blur(var(--glass-blur))',
              WebkitBackdropFilter: 'blur(var(--glass-blur))',
              border: '1px solid var(--glass-bd)',
              overflowX: 'auto',
              width: 'max-content',
              maxWidth: '100%',
            }}
          >
            {TABS.map((t) => {
              const active = t.id === tab;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    ...tabBase,
                    ...(active
                      ? { background: 'var(--bg-3)', color: 'var(--text-0)', boxShadow: '0 1px 0 rgba(255,255,255,0.06) inset' }
                      : {}),
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ marginTop: 34 }}>{renderTab(tab, user)}</div>
      </div>
    </HeroShell>
  );

  const header = <AppHeader active="profile" />;

  return (
    <div
      style={
        isMobile
          ? { height: '100svh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-0)', color: 'var(--text-0)' }
          : { minHeight: '100svh', background: 'var(--bg-0)', color: 'var(--text-0)' }
      }
    >
      {header}
      {isMobile ? <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>{body}</div> : body}
    </div>
  );
}
