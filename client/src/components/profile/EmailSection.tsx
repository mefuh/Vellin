import { useState } from 'react';
import type { AuthUser } from '@vellin/shared';
import { Button } from '../../shared';
import { profileApi } from '../../api/profile';
import { ApiHttpError } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { Card, LabeledInput, StatusLine } from './ProfilePrimitives';

export function EmailSection({ user }: { user: AuthUser }) {
  const applyAuthUpdate = useAuthStore((s) => s.applyAuthUpdate);
  const [email, setEmail] = useState(user.email ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const dirty = email.trim() !== (user.email ?? '');
  const valid = dirty && /.+@.+\..+/.test(email.trim()) && currentPassword.length > 0;

  const save = async () => {
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const res = await profileApi.changeEmail({ email: email.trim(), currentPassword });
      applyAuthUpdate(res);
      setCurrentPassword('');
      setSuccess('Email обновлён');
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось сменить email');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Email" desc="Для смены почты подтвердите текущий пароль." icon="globe">
      <LabeledInput label="Новый email" type="email" value={email} onChange={setEmail} autoComplete="email" />
      <LabeledInput
        label="Текущий пароль"
        type="password"
        value={currentPassword}
        onChange={setCurrentPassword}
        autoComplete="current-password"
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Button variant="primary" size="md" disabled={busy || !valid} onClick={save}>
          {busy ? 'Сохраняем…' : 'Сменить email'}
        </Button>
        <StatusLine error={error} success={success} />
      </div>
    </Card>
  );
}
