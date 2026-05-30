import { useState } from 'react';
import type { AuthUser } from '@vellin/shared';
import { Button } from '../../shared';
import { profileApi } from '../../api/profile';
import { ApiHttpError } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { Card, LabeledInput, LabeledTextarea, StatusLine } from './ProfilePrimitives';

export function IdentitySection({ user }: { user: AuthUser }) {
  const applyAuthUpdate = useAuthStore((s) => s.applyAuthUpdate);
  const [username, setUsername] = useState(user.username);
  const [bio, setBio] = useState(user.bio ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const dirty = username.trim() !== user.username || bio.trim() !== (user.bio ?? '');
  const valid = username.trim().length >= 2 && username.trim().length <= 32;

  const save = async () => {
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const res = await profileApi.updateProfile({
        username: username.trim() !== user.username ? username.trim() : undefined,
        bio: bio.trim() !== (user.bio ?? '') ? bio.trim() : undefined,
      });
      applyAuthUpdate(res);
      setSuccess('Сохранено');
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Профиль" desc="Имя пользователя и информация о себе." icon="user">
      <LabeledInput label="Имя пользователя" value={username} onChange={setUsername} autoComplete="username" />
      <LabeledTextarea label="О себе" value={bio} onChange={setBio} placeholder="Пара слов о себе" maxLength={300} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Button variant="primary" size="md" disabled={busy || !dirty || !valid} onClick={save}>
          {busy ? 'Сохраняем…' : 'Сохранить'}
        </Button>
        <StatusLine error={error} success={success} />
      </div>
    </Card>
  );
}
