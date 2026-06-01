import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../shared';
import { AuthShell, ErrorBanner, Field } from './AuthShell';
import { useAuthStore } from '../stores/authStore';

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
      navigate('/library');
    } catch {
      /* error from store */
    }
  };

  const disabled = loading || !email || !username || password.length < 8;

  return (
    <AuthShell
      title="Создать аккаунт"
      subtitle="Получите личную библиотеку комнат и историю просмотров."
      footer={
        <>
          Уже есть аккаунт?{' '}
          <Link to="/login" style={{ color: 'var(--accent-hi)' }}>
            Войдите
          </Link>
        </>
      }
    >
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Имя пользователя" name="username" value={username} onChange={setUsername} placeholder="vellin_fan" autoComplete="username" />
        <Field label="Email" type="email" name="email" value={email} onChange={setEmail} placeholder="you@example.com" autoComplete="email" />
        <Field
          label="Пароль (от 8 символов)"
          type="password"
          name="new-password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
          autoComplete="new-password"
          minLength={8}
        />
        <ErrorBanner message={error} />
        <Button type="submit" variant="primary" size="lg" full disabled={disabled}>
          {loading ? 'Создаём…' : 'Создать аккаунт'}
        </Button>
      </form>
    </AuthShell>
  );
}
