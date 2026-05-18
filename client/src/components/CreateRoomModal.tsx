import { useState } from 'react';
import { Button } from '../shared';
import { Icon } from '../shared/Icon';
import { roomsApi } from '../api/rooms';
import { ApiHttpError } from '../api/client';

interface CreateRoomModalProps {
  onClose: () => void;
  onCreated: (slug: string) => void;
}

const inputStyle = {
  height: 42,
  padding: '0 14px',
  borderRadius: 'var(--r-md)',
  border: '1px solid var(--line-2)',
  background: 'var(--bg-2)',
  color: 'var(--text-0)',
  fontSize: 14,
  width: '100%',
} as const;

export function CreateRoomModal({ onClose, onCreated }: CreateRoomModalProps) {
  const [name, setName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState('');
  const [maxParticipants, setMaxParticipants] = useState(20);
  const [allowGuests, setAllowGuests] = useState(true);
  const [hostOnlyControl, setHostOnlyControl] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = loading || name.trim().length === 0 || (isPrivate && password.length < 4);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { room } = await roomsApi.create({
        name: name.trim(),
        isPrivate,
        password: isPrivate ? password : undefined,
        maxParticipants,
        allowGuests,
        hostOnlyControl,
        videoUrl: videoUrl.trim() ? videoUrl.trim() : undefined,
      });
      onCreated(room.slug);
    } catch (err) {
      setError(err instanceof ApiHttpError ? err.payload.message : 'Не удалось создать комнату');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(8px)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 100,
        padding: 16,
        overflow: 'auto',
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        style={{
          background: 'var(--bg-1)',
          border: '1px solid var(--line-2)',
          borderRadius: 'var(--r-xl)',
          padding: 'clamp(20px, 4vw, 28px)',
          maxWidth: 540,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          boxShadow: 'var(--shadow-3)',
        }}
      >
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em' }}>
            Новая комната
          </h2>
          <button type="button" onClick={onClose} style={{ color: 'var(--text-2)' }}>
            <Icon name="close" size={18} />
          </button>
        </header>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Название
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Пятница, кино"
            maxLength={80}
            style={inputStyle}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Ссылка на видео (необязательно)
          </span>
          <input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://…/movie.mp4"
            style={inputStyle}
          />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          <button
            type="button"
            onClick={() => setIsPrivate(false)}
            style={{
              padding: '14px 16px',
              borderRadius: 'var(--r-md)',
              border: `1px solid ${!isPrivate ? 'var(--accent)' : 'var(--line-2)'}`,
              background: !isPrivate ? 'var(--accent-soft)' : 'var(--bg-2)',
              textAlign: 'left',
              color: 'var(--text-0)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Icon name="globe" size={18} />
            <div>
              <div style={{ fontWeight: 600 }}>Публичная</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Видна в списке</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setIsPrivate(true)}
            style={{
              padding: '14px 16px',
              borderRadius: 'var(--r-md)',
              border: `1px solid ${isPrivate ? 'var(--accent)' : 'var(--line-2)'}`,
              background: isPrivate ? 'var(--accent-soft)' : 'var(--bg-2)',
              textAlign: 'left',
              color: 'var(--text-0)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Icon name="lock" size={18} />
            <div>
              <div style={{ fontWeight: 600 }}>Приватная</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Только по паролю</div>
            </div>
          </button>
        </div>

        {isPrivate && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Пароль (от 4 символов)
            </span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              minLength={4}
              maxLength={64}
              style={inputStyle}
            />
          </label>
        )}

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Макс. участников: {maxParticipants}
          </span>
          <input
            type="range"
            min={2}
            max={50}
            value={maxParticipants}
            onChange={(e) => setMaxParticipants(parseInt(e.target.value, 10))}
            style={{ width: '100%' }}
          />
        </label>

        <ToggleRow label="Разрешить гостей" value={allowGuests} onChange={setAllowGuests} />
        <ToggleRow label="Только хост управляет плеером" value={hostOnlyControl} onChange={setHostOnlyControl} />

        {error && (
          <div
            style={{
              background: 'rgba(209,39,27,0.12)',
              color: 'var(--accent-hi)',
              padding: '10px 14px',
              borderRadius: 'var(--r-md)',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" disabled={disabled} iconRight="arrow">
            {loading ? 'Создаём…' : 'Создать'}
          </Button>
        </footer>
      </form>
    </div>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ color: 'var(--text-1)', fontSize: 14 }}>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        style={{
          width: 44,
          height: 26,
          borderRadius: 999,
          background: value ? 'var(--accent)' : 'var(--bg-3)',
          position: 'relative',
          transition: 'background .12s',
          boxShadow: 'inset 0 0 0 1px var(--line-2)',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: value ? 20 : 2,
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left .12s',
          }}
        />
      </button>
    </label>
  );
}
