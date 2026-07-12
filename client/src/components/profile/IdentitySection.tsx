import { useEffect, useState } from 'react';
import type { AuthUser, Gender } from '@vellin/shared';
import { profileApi } from '../../api/profile';
import { ApiHttpError } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { Card, FieldLabel, LabeledInput, LabeledTextarea, SaveBar, StatusLine } from './ProfilePrimitives';
import { CityAutocomplete } from './CityAutocomplete';

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Мужской' },
  { value: 'female', label: 'Женский' },
  { value: 'other', label: 'Другой' },
];

export function IdentitySection({ user }: { user: AuthUser }) {
  const applyAuthUpdate = useAuthStore((s) => s.applyAuthUpdate);
  const [username, setUsername] = useState(user.username);
  const [bio, setBio] = useState(user.bio ?? '');
  const [gender, setGender] = useState<string>(user.gender ?? '');
  const [birthDate, setBirthDate] = useState(user.birthDate ?? '');
  // Город: текст в поле + флаг «значение подтверждено выбором из списка».
  // Исходное значение считаем подтверждённым (не отправляем, пока не тронут).
  const [cityText, setCityText] = useState(user.city ?? '');
  const [cityConfirmed, setCityConfirmed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Ошибка города показывается только после попытки сохранить, а не при вводе.
  const [cityError, setCityError] = useState<string | null>(null);

  // Синхронизируем поля, если user поменялся извне (например после аплоада аватара
  // из hero applyAuthUpdate возвращает свежего user — но здешние поля не трогаем,
  // чтобы не затирать несохранённый ввод; сбрасываем только когда нет правок).

  // Разрешённое значение города: '' (очищено), сама подпись (подтверждено)
  // или null (введён текст, но вариант из списка не выбран).
  const cityResolved = cityText.trim() === '' ? '' : cityConfirmed ? cityText.trim() : null;
  const cityUnresolved = cityResolved === null;
  const cityDirty = cityResolved !== null && cityResolved !== (user.city ?? '');

  const dirty =
    username.trim() !== user.username ||
    bio.trim() !== (user.bio ?? '') ||
    (gender || null) !== (user.gender ?? null) ||
    (birthDate || null) !== (user.birthDate ?? null) ||
    cityDirty ||
    cityUnresolved; // незавершённый ввод города тоже делает форму «грязной»
  const valid = username.trim().length >= 2 && username.trim().length <= 32;

  // Тост «Сохранено» гаснет сам через 2с.
  useEffect(() => {
    if (!saved) return;
    const id = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(id);
  }, [saved]);

  const reset = () => {
    setUsername(user.username);
    setBio(user.bio ?? '');
    setGender(user.gender ?? '');
    setBirthDate(user.birthDate ?? '');
    setCityText(user.city ?? '');
    setCityConfirmed(true);
    setCityError(null);
    setError(null);
  };

  const save = async () => {
    setError(null);
    // Город введён, но вариант не выбран — подсказываем именно сейчас.
    if (cityUnresolved) {
      setCityError('Выберите город из списка');
      return;
    }
    setCityError(null);
    setBusy(true);
    try {
      const res = await profileApi.updateProfile({
        username: username.trim() !== user.username ? username.trim() : undefined,
        bio: bio.trim() !== (user.bio ?? '') ? bio.trim() : undefined,
        gender: (gender || null) !== (user.gender ?? null) ? ((gender || null) as Gender | null) : undefined,
        birthDate: (birthDate || null) !== (user.birthDate ?? null) ? birthDate || null : undefined,
        city: cityDirty ? cityResolved || null : undefined,
      });
      applyAuthUpdate(res);
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card title="О себе" desc="Всё, что видят другие на вашей странице. Меняйте прямо здесь — изменения сохраняются одним движением.">
        <LabeledInput label="Имя пользователя" value={username} onChange={setUsername} autoComplete="username" big />

        <div>
          <FieldLabel>Пол</FieldLabel>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {GENDERS.map((g) => {
              const active = gender === g.value;
              return (
                <button
                  key={g.value}
                  type="button"
                  // Повторный клик по активному — снять выбор (пол не указан).
                  onClick={() => setGender(active ? '' : g.value)}
                  style={{
                    fontFamily: 'inherit',
                    fontSize: 14,
                    fontWeight: 600,
                    padding: '10px 20px',
                    borderRadius: 999,
                    cursor: 'pointer',
                    transition: 'background .2s, color .2s, border-color .2s',
                    border: `1px solid ${active ? 'var(--accent-glow)' : 'var(--line-2)'}`,
                    background: active ? 'var(--accent-soft)' : 'var(--bg-2)',
                    color: active ? 'var(--accent-hi)' : 'var(--text-2)',
                  }}
                >
                  {g.label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <LabeledInput
              label="Дата рождения"
              type="date"
              value={birthDate}
              onChange={setBirthDate}
              autoComplete="bday"
              inputStyle={{ colorScheme: 'dark', fontSize: 17 }}
            />
          </div>
          <div style={{ flex: 2, minWidth: 220 }}>
            <CityAutocomplete
              value={cityText}
              confirmed={cityConfirmed}
              onChange={(t) => {
                setCityText(t);
                setCityConfirmed(t.trim() === '');
                setCityError(null);
              }}
              onSelect={(label) => {
                setCityText(label);
                setCityConfirmed(true);
                setCityError(null);
              }}
              hint={cityError}
            />
          </div>
        </div>

        <LabeledTextarea label="О себе" value={bio} onChange={setBio} placeholder="Расскажите пару слов о себе…" maxLength={300} />
      </Card>

      {error && (
        <div style={{ marginTop: 14 }}>
          <StatusLine error={error} />
        </div>
      )}

      <SaveBar dirty={dirty} saved={saved} busy={busy} canSave={valid} onSave={() => void save()} onCancel={reset} />
    </>
  );
}
