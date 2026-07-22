import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../shared';
import { AuthShell, ErrorBanner, Field } from './AuthShell';
import { useAuthStore } from '../stores/authStore';

export function Login() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      navigate('/profile');
    } catch {
      /* ошибка показана из стора */
    }
  };

  return (
    <AuthShell
      title="Войти в Vellin"
      subtitle="Email и пароль от вашего аккаунта."
      footer={
        <>
          Нет аккаунта?{' '}
          <Link to="/register" style={{ color: 'var(--accent-hi)' }}>
            Зарегистрируйтесь
          </Link>
        </>
      }
    >
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field
          label="Email"
          type="email"
          name="email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          autoComplete="username"
        />
        <Field
          label="Пароль"
          type="password"
          name="password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
          autoComplete="current-password"
          minLength={8}
        />
        <ErrorBanner message={error} />
        <Button type="submit" variant="primary" size="lg" full disabled={loading || !email || !password}>
          {loading ? 'Входим…' : 'Войти'}
        </Button>
      </form>
    </AuthShell>
  );
}
