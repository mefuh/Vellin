import { useState } from 'react';
import type { AuthUser, Gender } from '@vellin/shared';
import { Button } from '../../shared';
import { profileApi } from '../../api/profile';
import { ApiHttpError } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { useIsNarrow } from '../../hooks/useMediaQuery';
import { Card, LabeledInput, LabeledSelect, LabeledTextarea, StatusLine } from './ProfilePrimitives';

const GENDER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Не указан' },
  { value: 'male', label: 'Мужской' },
  { value: 'female', label: 'Женский' },
  { value: 'other', label: 'Другой' },
];

export function IdentitySection({ user }: { user: AuthUser }) {
  const applyAuthUpdate = useAuthStore((s) => s.applyAuthUpdate);
  const isNarrow = useIsNarrow();
  const [username, setUsername] = useState(user.username);
  const [bio, setBio] = useState(user.bio ?? '');
  const [gender, setGender] = useState<string>(user.gender ?? '');
  const [birthDate, setBirthDate] = useState(user.birthDate ?? '');
  const [city, setCity] = useState(user.city ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const dirty =
    username.trim() !== user.username ||
    bio.trim() !== (user.bio ?? '') ||
    (gender || null) !== (user.gender ?? null) ||
    (birthDate || null) !== (user.birthDate ?? null) ||
    city.trim() !== (user.city ?? '');
  const valid = username.trim().length >= 2 && username.trim().length <= 32;

  const save = async () => {
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const res = await profileApi.updateProfile({
        username: username.trim() !== user.username ? username.trim() : undefined,
        bio: bio.trim() !== (user.bio ?? '') ? bio.trim() : undefined,
        gender: (gender || null) !== (user.gender ?? null) ? ((gender || null) as Gender | null) : undefined,
        birthDate: (birthDate || null) !== (user.birthDate ?? null) ? birthDate || null : undefined,
        city: city.trim() !== (user.city ?? '') ? city.trim() || null : undefined,
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
      <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : '1fr 1fr', gap: 14 }}>
        <LabeledSelect label="Пол" value={gender} onChange={setGender} options={GENDER_OPTIONS} />
        <LabeledInput
          label="Дата рождения"
          type="date"
          value={birthDate}
          onChange={setBirthDate}
          autoComplete="bday"
          style={{ colorScheme: 'dark' }}
        />
      </div>
      <LabeledInput
        label="Город"
        value={city}
        onChange={setCity}
        placeholder="Например, Москва"
        maxLength={80}
        autoComplete="address-level2"
      />
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
