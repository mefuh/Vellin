import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthShell, ErrorBanner, Field } from './AuthShell';
import { useAuthStore } from '../stores/authStore';

export function Guest() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') ?? '/library';
  const loginAsGuest = useAuthStore((s) => s.loginAsGuest);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const [username, setUsername] = useState('Guest');

  useEffect(() => {
    setUsername(`Guest-${Math.floor(Math.random() * 9000 + 1000)}`);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await loginAsGuest(username.trim());
      navigate(next);
    } catch {
      /* error from store */
    }
  };

  return (
    <AuthShell
      title="Войти гостем"
      subtitle="Без регистрации. Имя и доступ к публичным комнатам."
      footer={
        <>
          Хотите сохранять историю?{' '}
          <Link to="/register" className="vx-link">
            Создайте аккаунт
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="vx-auth__form">
        <Field label="Ник" value={username} onChange={setUsername} placeholder="Гость" />
        <ErrorBanner message={error} />
        <button type="submit" className="vx-btn vx-btn--paper vx-auth__submit" disabled={loading || username.trim().length < 2}>
          {loading ? 'Подключаемся…' : 'Войти как гость'}
        </button>
      </form>
    </AuthShell>
  );
}
