import { useState } from 'react';
import type { AuthUser } from '@vellin/shared';
import { profileApi } from '../../api/profile';
import { ApiHttpError } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { Card, LabeledInput, PillSubmit, StatusLine } from './ProfilePrimitives';

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
    <div style={{ maxWidth: 520 }}>
      <Card title="Почта" desc="На неё приходят входы и важные уведомления. Для смены подтвердите текущий пароль.">
        <LabeledInput label="Новый email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <LabeledInput
          label="Текущий пароль"
          type="password"
          value={currentPassword}
          onChange={setCurrentPassword}
          autoComplete="current-password"
        />
      </Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 20 }}>
        <PillSubmit disabled={busy || !valid} onClick={save}>
          {busy ? 'Сохраняем…' : 'Сменить email'}
        </PillSubmit>
        <StatusLine error={error} success={success} />
      </div>
    </div>
  );
}
