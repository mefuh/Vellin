import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../shared';
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
          <Link to="/register" style={{ color: 'var(--accent-hi)' }}>
            Создайте аккаунт
          </Link>
        </>
      }
    >
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Ник" value={username} onChange={setUsername} placeholder="Гость" />
        <ErrorBanner message={error} />
        <Button type="submit" variant="primary" size="lg" full disabled={loading || username.trim().length < 2}>
          {loading ? 'Подключаемся…' : 'Войти как гость'}
        </Button>
      </form>
    </AuthShell>
  );
}
