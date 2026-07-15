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
import { NotificationSettings } from './pages/NotificationSettings';
import { RealtimeProvider } from './realtime/RealtimeProvider';
import { MobileDock } from './components/MobileDock';
import { PushBridge } from './push/PushBridge';
import { PushPrompt } from './push/PushPrompt';
import { AdminShell } from './pages/admin/AdminShell';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminUsers } from './pages/admin/AdminUsers';
import { AdminRooms } from './pages/admin/AdminRooms';
import { AdminPush } from './pages/admin/AdminPush';
import { AdminRoles } from './pages/admin/AdminRoles';
import { AdminAudit } from './pages/admin/AdminAudit';
import { AdminUserProfile } from './pages/admin/AdminUserProfile';
import { AdminAnalytics } from './pages/admin/AdminAnalytics';
import { AdminReports } from './pages/admin/AdminReports';
import { AdminDmModeration } from './pages/admin/AdminDmModeration';
import { AdminPlatform } from './pages/admin/AdminPlatform';
import { AdminSystem } from './pages/admin/AdminSystem';
import { RuntimeLayer } from './components/RuntimeLayer';

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
          path="/messages/:publicId"
          element={
            <ProtectedRoute>
              <Messages />
            </ProtectedRoute>
          }
        />
        <Route
          path="/u/:publicId"
          element={
            <ProtectedRoute>
              <PublicProfile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings/notifications"
          element={
            <ProtectedRoute>
              <NotificationSettings />
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
        <Route path="analytics" element={<AdminAnalytics />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="users/:id" element={<AdminUserProfile />} />
        <Route path="rooms" element={<AdminRooms />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="dm" element={<AdminDmModeration />} />
        <Route path="push" element={<AdminPush />} />
        <Route path="roles" element={<AdminRoles />} />
        <Route path="audit" element={<AdminAudit />} />
        <Route path="platform" element={<AdminPlatform />} />
        <Route path="system" element={<AdminSystem />} />
      </Route>
      <Route path="*" element={<NotFound />} />
      </Routes>
      <MobileDock />
      <PushBridge />
      <PushPrompt />
      <RuntimeLayer />
    </RealtimeProvider>
  );
}
