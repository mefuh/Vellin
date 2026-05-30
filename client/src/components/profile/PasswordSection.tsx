import { useState } from 'react';
import { Button } from '../../shared';
import { profileApi } from '../../api/profile';
import { ApiHttpError } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { Card, LabeledInput, StatusLine } from './ProfilePrimitives';

export function PasswordSection() {
  const applyAuthUpdate = useAuthStore((s) => s.applyAuthUpdate);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const valid =
    currentPassword.length > 0 && newPassword.length >= 8 && newPassword === repeat;

  const save = async () => {
    setError(null);
    setSuccess(null);
    if (newPassword !== repeat) {
      setError('Пароли не совпадают');
      return;
    }
    setBusy(true);
    try {
      const res = await profileApi.changePassword({ currentPassword, newPassword });
      applyAuthUpdate(res);
      setCurrentPassword('');
      setNewPassword('');
      setRepeat('');
      setSuccess('Пароль изменён');
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось сменить пароль');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Пароль" desc="После смены пароля вы выйдете со всех других устройств." icon="lock">
      <LabeledInput
        label="Текущий пароль"
        type="password"
        value={currentPassword}
        onChange={setCurrentPassword}
        autoComplete="current-password"
      />
      <LabeledInput
        label="Новый пароль (от 8 символов)"
        type="password"
        value={newPassword}
        onChange={setNewPassword}
        autoComplete="new-password"
      />
      <LabeledInput
        label="Повторите новый пароль"
        type="password"
        value={repeat}
        onChange={setRepeat}
        autoComplete="new-password"
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Button variant="primary" size="md" disabled={busy || !valid} onClick={save}>
          {busy ? 'Сохраняем…' : 'Сменить пароль'}
        </Button>
        <StatusLine error={error} success={success} />
      </div>
    </Card>
  );
}
