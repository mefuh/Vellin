import { useRef, useState } from 'react';
import type { AuthUser } from '@vellin/shared';
import { Avatar, Button } from '../../shared';
import { profileApi } from '../../api/profile';
import { ApiHttpError } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { Card, StatusLine } from './ProfilePrimitives';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

export function AvatarSection({ user }: { user: AuthUser }) {
  const applyAuthUpdate = useAuthStore((s) => s.applyAuthUpdate);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const reset = () => {
    setError(null);
    setSuccess(null);
  };

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    reset();
    if (!ALLOWED.includes(file.type)) {
      setError('Поддерживаются только JPEG, PNG и WebP');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Файл слишком большой (макс. 5 МБ)');
      return;
    }
    setBusy(true);
    try {
      const res = await profileApi.uploadAvatar(file);
      applyAuthUpdate(res);
      setSuccess('Аватар обновлён');
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось загрузить аватар');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const regenerate = async () => {
    reset();
    setBusy(true);
    try {
      const res = await profileApi.updateProfile({ avatarSeed: null });
      applyAuthUpdate(res);
      setSuccess('Сгенерирован новый аватар');
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось обновить аватар');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Аватар" desc="Загрузите фото или используйте сгенерированный градиент." icon="image">
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
        <Avatar
          name={user.username}
          seed={user.avatarSeed}
          src={user.avatarUrl}
          size={88}
          style={{ borderRadius: '50%' }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="primary" size="sm" icon="upload" disabled={busy} onClick={() => fileRef.current?.click()}>
              Загрузить фото
            </Button>
            <Button variant="secondary" size="sm" icon="refresh" disabled={busy} onClick={regenerate}>
              {user.avatarUrl ? 'Вернуть градиент' : 'Сгенерировать другой'}
            </Button>
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>JPEG, PNG или WebP, до 5 МБ. Обрежется в квадрат.</span>
          <StatusLine error={error} success={success} />
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => void onPick(e.target.files?.[0])}
      />
    </Card>
  );
}
