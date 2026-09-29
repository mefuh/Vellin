import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthShell, ErrorBanner, Field } from './AuthShell';
import { useAuthStore } from '../stores/authStore';
import { destinationAfterAuth } from '../landing/pendingRoom';
import { PendingVideoNote } from '../landing/PendingVideoNote';

export function Register() {
  const navigate = useNavigate();
  const register = useAuthStore((s) => s.register);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await register(email, username, password);
    } catch {
      return; // ошибку показывает стор
    }
    // Ссылка с лэндинга, если она ждёт, становится комнатой.
    navigate(await destinationAfterAuth());
  };

  const disabled = loading || !email || !username || password.length < 8;

  return (
    <AuthShell
      title="Создать аккаунт"
      subtitle="Свои комнаты, друзья и история просмотров."
      footer={
        <>
          Уже есть аккаунт?{' '}
          <Link to="/login" className="vx-link">
            Войдите
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="vx-auth__form">
        <PendingVideoNote after="регистрации" />
        <Field
          label="Имя пользователя"
          name="username"
          value={username}
          onChange={setUsername}
          placeholder="vellin_fan"
          autoComplete="username"
        />
        <Field
          label="Email"
          type="email"
          name="email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          autoComplete="email"
        />
        <Field
          label="Пароль"
          type="password"
          name="new-password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
          autoComplete="new-password"
          minLength={8}
          hint="Не короче 8 символов."
        />
        <ErrorBanner message={error} />
        <button type="submit" className="vx-btn vx-btn--paper vx-auth__submit" disabled={disabled}>
          {loading ? 'Создаём…' : 'Создать аккаунт'}
        </button>
      </form>
    </AuthShell>
  );
}
