import { useRef, useState } from 'react';
import { profileApi } from '../api/profile';
import { ApiHttpError } from '../api/client';
import { useAuthStore } from '../stores/authStore';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Логика загрузки/сброса аватара пользователя (вынесена из бывшего
 * `AvatarSection`). Загружает файл через `profileApi.uploadAvatar`, «сброс к
 * градиенту» — `updateProfile({ avatarSeed: null })`. Применяет результат в
 * `authStore` и отдаёт статус для UI.
 */
export function useAvatarUpload() {
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

  return { fileRef, busy, error, success, onPick, regenerate, reset };
}
