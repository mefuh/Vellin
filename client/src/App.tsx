import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Guest } from './pages/Guest';
import { Library } from './pages/Library';
import { Profile } from './pages/Profile';
import { Friends } from './pages/Friends';
import { PublicProfile } from './pages/PublicProfile';
import { Room } from './pages/Room';
import { NotFound } from './pages/NotFound';
import { RealtimeProvider } from './realtime/RealtimeProvider';
import { AdminShell } from './pages/admin/AdminShell';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminUsers } from './pages/admin/AdminUsers';
import { AdminRooms } from './pages/admin/AdminRooms';

function ProtectedRoute({ children }: { children: React.ReactElement }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
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
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/guest" element={<Guest />} />
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
    </RealtimeProvider>
  );
}
