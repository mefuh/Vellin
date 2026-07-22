import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AuthUser, Gender } from '@vellin/shared';
import { Avatar, Button, VellinLogo } from '../shared';
import { Field, ErrorBanner } from './AuthShell';
import { useAuthStore } from '../stores/authStore';
import { profileApi } from '../api/auth';
import { ApiHttpError } from '../api/client';
import { resolveMediaUrl } from '../runtime/config';
import { APP_VERSION } from '../runtime/platform';

const cardStyle: CSSProperties = {
  background: 'var(--bg-1)',
  border: '1px solid var(--line-2)',
  borderRadius: 'var(--r-lg)',
  padding: 24,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={cardStyle}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>{title}</h2>
      {children}
    </section>
  );
}

function Success({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      style={{
        background: 'rgba(46,160,67,0.12)',
        color: 'var(--ok)',
        padding: '10px 14px',
        borderRadius: 'var(--r-md)',
        fontSize: 13,
        border: '1px solid rgba(46,160,67,0.3)',
      }}
    >
      {message}
    </div>
  );
}

function errText(err: unknown): string {
  if (err instanceof ApiHttpError) return err.payload.message;
  return err instanceof Error ? err.message : 'Что-то пошло не так';
}

/** Профиль зарегистрированного пользователя: личные данные, аватар, email, пароль. */
export function Profile() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const applyAuthUpdate = useAuthStore((s) => s.applyAuthUpdate);
  const logout = useAuthStore((s) => s.logout);

  if (!user) return null;

  const doLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg-0)', color: 'var(--text-0)' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          borderBottom: '1px solid var(--line-2)',
        }}
      >
        <VellinLogo size={22} />
        <Button variant="ghost" size="sm" onClick={doLogout}>
          Выйти
        </Button>
      </header>

      <main
        style={{
          maxWidth: 640,
          margin: '0 auto',
          padding: '28px 20px 64px',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        <IdentityCard user={user} onUpdated={applyAuthUpdate} />
        <EmailCard user={user} onUpdated={applyAuthUpdate} />
        <PasswordCard onUpdated={applyAuthUpdate} />
        <p style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 12, margin: 0 }}>
          Vellin для Windows · v{APP_VERSION}
        </p>
      </main>
    </div>
  );
}

// ── Личные данные + аватар ──────────────────────────────────────────────────
function IdentityCard({ user, onUpdated }: { user: AuthUser; onUpdated: (u: { token: string; user: AuthUser }) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState(user.username);
  const [bio, setBio] = useState(user.bio ?? '');
  const [gender, setGender] = useState<Gender | ''>(user.gender ?? '');
  const [birthDate, setBirthDate] = useState(user.birthDate ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await profileApi.updateProfile({
        username: username.trim(),
        bio: bio.trim() || null,
        gender: gender || null,
        birthDate: birthDate || null,
      });
      onUpdated(res);
      setOk('Сохранено');
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const pickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await profileApi.uploadAvatar(file);
      onUpdated(res);
      setOk('Аватар обновлён');
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Профиль">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Avatar name={user.username} seed={user.avatarSeed} src={resolveMediaUrl(user.avatarUrl)} size={72} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>{user.username}</div>
          <div>
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
              Сменить аватар
            </Button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pickAvatar} />
          </div>
        </div>
      </div>

      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Имя пользователя" name="username" value={username} onChange={setUsername} />
        <Field label="О себе" name="bio" value={bio} onChange={setBio} placeholder="Пара слов о вас" />
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text-2)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Пол
          </span>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as Gender | '')}
            style={{
              height: 44,
              padding: '0 14px',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--line-2)',
              background: 'var(--bg-2)',
              color: 'var(--text-0)',
              fontSize: 15,
            }}
          >
            <option value="">Не указан</option>
            <option value="male">Мужской</option>
            <option value="female">Женский</option>
            <option value="other">Другой</option>
          </select>
        </label>
        <Field label="Дата рождения" type="date" name="birthDate" value={birthDate} onChange={setBirthDate} />
        <ErrorBanner message={error} />
        <Success message={ok} />
        <Button type="submit" variant="primary" full disabled={busy || !username.trim()}>
          {busy ? 'Сохраняем…' : 'Сохранить'}
        </Button>
      </form>
    </Card>
  );
}

// ── Смена email ─────────────────────────────────────────────────────────────
function EmailCard({ user, onUpdated }: { user: AuthUser; onUpdated: (u: { token: string; user: AuthUser }) => void }) {
  const [email, setEmail] = useState(user.email ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await profileApi.changeEmail({ email: email.trim(), currentPassword: password });
      onUpdated(res);
      setPassword('');
      setOk('Email обновлён');
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Email">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Новый email" type="email" name="new-email" value={email} onChange={setEmail} autoComplete="email" />
        <Field
          label="Текущий пароль"
          type="password"
          name="current-password"
          value={password}
          onChange={setPassword}
          placeholder="Для подтверждения"
          autoComplete="current-password"
        />
        <ErrorBanner message={error} />
        <Success message={ok} />
        <Button type="submit" variant="secondary" full disabled={busy || !email.trim() || !password}>
          {busy ? 'Сохраняем…' : 'Сменить email'}
        </Button>
      </form>
    </Card>
  );
}

// ── Смена пароля ────────────────────────────────────────────────────────────
function PasswordCard({ onUpdated }: { onUpdated: (u: { token: string; user: AuthUser }) => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await profileApi.changePassword({ currentPassword: current, newPassword: next });
      onUpdated(res);
      setCurrent('');
      setNext('');
      setOk('Пароль обновлён. Остальные сессии завершены.');
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Пароль">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field
          label="Текущий пароль"
          type="password"
          name="current-password"
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
        />
        <Field
          label="Новый пароль (от 8 символов)"
          type="password"
          name="new-password"
          value={next}
          onChange={setNext}
          minLength={8}
          autoComplete="new-password"
        />
        <ErrorBanner message={error} />
        <Success message={ok} />
        <Button type="submit" variant="secondary" full disabled={busy || !current || next.length < 8}>
          {busy ? 'Сохраняем…' : 'Сменить пароль'}
        </Button>
      </form>
    </Card>
  );
}
