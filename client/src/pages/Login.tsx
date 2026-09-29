import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthShell, ErrorBanner, Field } from './AuthShell';
import { useAuthStore } from '../stores/authStore';
import { destinationAfterAuth } from '../landing/pendingRoom';
import { PendingVideoNote } from '../landing/PendingVideoNote';

export function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const blocked = searchParams.get('blocked') === '1';
  const login = useAuthStore((s) => s.login);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
    } catch {
      return; // ошибку показывает стор
    }
    // Ссылка с лэндинга, если она ждёт, становится комнатой.
    navigate(await destinationAfterAuth());
  };

  return (
    <AuthShell
      title="Вход в Vellin"
      subtitle="Email и пароль от вашего аккаунта."
      footer={
        <>
          Нет аккаунта?{' '}
          <Link to="/register" className="vx-link">
            Создайте его
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="vx-auth__form">
        {blocked && <ErrorBanner message="Ваш аккаунт заблокирован администратором." />}
        <PendingVideoNote after="входа" />
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
        <button
          type="submit"
          className="vx-btn vx-btn--paper vx-auth__submit"
          disabled={loading || !email || !password}
        >
          {loading ? 'Входим…' : 'Войти'}
        </button>
      </form>
    </AuthShell>
  );
}
