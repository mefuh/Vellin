import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Guest } from './pages/Guest';
import { Library } from './pages/Library';
import { Profile } from './pages/Profile';
import { Friends } from './pages/Friends';
import { Messages } from './pages/Messages';
import { PublicProfile } from './pages/PublicProfile';
import { Room } from './pages/Room';
import { NotFound } from './pages/NotFound';
import { RealtimeProvider } from './realtime/RealtimeProvider';
import { MobileDock } from './components/MobileDock';
import { AdminShell } from './pages/admin/AdminShell';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminUsers } from './pages/admin/AdminUsers';
import { AdminRooms } from './pages/admin/AdminRooms';

function ProtectedRoute({ children }: { children: React.ReactElement }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

/**
 * Страницы, бесполезные для уже вошедших (лендинг, гостевой вход): любой
 * пользователь с активной сессией — включая гостя — отправляется в библиотеку.
 * Для авторизованных главная страница и есть библиотека.
 */
function PublicOnlyRoute({ children }: { children: React.ReactElement }) {
  const token = useAuthStore((s) => s.token);
  if (token) return <Navigate to="/library" replace />;
  return children;
}

function AdminProtectedRoute({ children }: { children: React.ReactElement }) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  if (!token) return <Navigate to="/login" replace />;
  if (!user?.isAdmin) return <Navigate to="/library" replace />;
  return children;
}

/** Временный диагностический индикатор (display-mode, высоты вьюпорта, safe-area).
 *  Нужен, чтобы по скрину точно понять геометрию на устройстве. Удалить после. */
function DebugBar() {
  const [s, setS] = useState('');
  useEffect(() => {
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;left:0;bottom:0;width:1px;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom);visibility:hidden;pointer-events:none;';
    document.body.appendChild(probe);
    const tick = (): void => {
      const cs = getComputedStyle(probe);
      const dm = matchMedia('(display-mode: standalone)').matches ? 'PWA' : 'web';
      const vv = window.visualViewport;
      setS(`${dm} iH${window.innerHeight} vv${vv ? Math.round(vv.height) : '-'} top${cs.paddingTop} bot${cs.paddingBottom}`);
    };
    tick();
    window.addEventListener('resize', tick);
    window.visualViewport?.addEventListener('resize', tick);
    return () => {
      window.removeEventListener('resize', tick);
      window.visualViewport?.removeEventListener('resize', tick);
      probe.remove();
    };
  }, []);
  return (
    <div
      style={{
        position: 'fixed',
        left: 6,
        top: 'calc(env(safe-area-inset-top, 0px) + 2px)',
        zIndex: 99999,
        background: 'rgba(0,0,0,0.7)',
        color: '#39ff14',
        font: '10px/1.3 monospace',
        padding: '1px 5px',
        borderRadius: 4,
        pointerEvents: 'none',
      }}
    >
      {s}
    </div>
  );
}

export function App() {
  return (
    <RealtimeProvider>
      <Routes>
        <Route
          path="/"
          element={
            <PublicOnlyRoute>
              <Landing />
            </PublicOnlyRoute>
          }
        />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/guest"
          element={
            <PublicOnlyRoute>
              <Guest />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/library"
          element={
            <ProtectedRoute>
              <Library />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/friends"
          element={
            <ProtectedRoute>
              <Friends />
            </ProtectedRoute>
          }
        />
        <Route
          path="/messages"
          element={
            <ProtectedRoute>
              <Messages />
            </ProtectedRoute>
          }
        />
        <Route
          path="/messages/:username"
          element={
            <ProtectedRoute>
              <Messages />
            </ProtectedRoute>
          }
        />
        <Route
          path="/u/:username"
          element={
            <ProtectedRoute>
              <PublicProfile />
            </ProtectedRoute>
          }
        />
      <Route
        path="/room/:slug"
        element={
          <ProtectedRoute>
            <Room />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <AdminProtectedRoute>
            <AdminShell />
          </AdminProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="rooms" element={<AdminRooms />} />
      </Route>
      <Route path="*" element={<NotFound />} />
      </Routes>
      <MobileDock />
      <DebugBar />
    </RealtimeProvider>
  );
}
