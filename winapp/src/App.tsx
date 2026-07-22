import { useEffect, useState, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Button } from './shared';
import { useAuthStore } from './stores/authStore';
import { setUpgradeRequiredHandler } from './api/client';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Profile } from './pages/Profile';
import { APP_VERSION } from './runtime/platform';

/** Полноэкранная заглушка на время восстановления сессии. */
function Splash() {
  return (
    <div
      style={{
        minHeight: '100svh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--bg-0)',
        color: 'var(--text-2)',
        fontSize: 14,
      }}
    >
      Загрузка…
    </div>
  );
}

/** Экран принудительного обновления (ответ сервера 426). */
function UpgradeGate({ minVersion }: { minVersion: string }) {
  return (
    <div
      style={{
        minHeight: '100svh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: 'var(--bg-0)',
        color: 'var(--text-0)',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Нужно обновление</h1>
        <p style={{ margin: 0, color: 'var(--text-1)', fontSize: 14, lineHeight: 1.5 }}>
          Ваша версия ({APP_VERSION}) больше не поддерживается. Обновите Vellin
          {minVersion ? ` до версии ${minVersion} или новее` : ''}, чтобы продолжить.
        </p>
      </div>
    </div>
  );
}

/** Пропускает только авторизованных; иначе — на вход. */
function RequireAuth({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const location = useLocation();
  if (!token) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

/** На экранах входа/регистрации авторизованного отправляем в профиль. */
function GuestOnly({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (token) return <Navigate to="/profile" replace />;
  return <>{children}</>;
}

export function App() {
  const ready = useAuthStore((s) => s.ready);
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const [upgrade, setUpgrade] = useState<string | null>(null);

  useEffect(() => {
    setUpgradeRequiredHandler((minVersion) => setUpgrade(minVersion));
    void restoreSession();
  }, [restoreSession]);

  if (upgrade !== null) return <UpgradeGate minVersion={upgrade} />;
  if (!ready) return <Splash />;

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
        <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
        <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/profile" replace />} />
      </Routes>
    </HashRouter>
  );
}
