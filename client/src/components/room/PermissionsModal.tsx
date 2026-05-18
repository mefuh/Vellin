import { useState } from 'react';
import type { ParticipantInfo, RoomPermissions } from '@vellin/shared';
import { Button } from '../../shared';
import { Avatar } from '../../shared';
import { ApiHttpError } from '../../api/client';

interface Props {
  participant: ParticipantInfo;
  onClose: () => void;
  onSave: (perms: RoomPermissions) => Promise<void>;
}

const ROWS: Array<{ key: keyof RoomPermissions; label: string; hint: string }> = [
  { key: 'canPlayPause', label: 'Play / Pause', hint: 'Может ставить на паузу и запускать' },
  { key: 'canSeek', label: 'Перемотка', hint: 'Может перематывать видео' },
  { key: 'canSetVideoUrl', label: 'Сменить видео', hint: 'Может загрузить другое видео в комнату' },
  { key: 'canManagePlaylist', label: 'Управлять плейлистом', hint: 'Может добавлять/удалять/пересортировать' },
];

export function PermissionsModal({ participant, onClose, onSave }: Props) {
  const [perms, setPerms] = useState<RoomPermissions>(participant.permissions);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      await onSave(perms);
    } catch (err) {
      setError(err instanceof ApiHttpError ? err.payload.message : 'Не удалось сохранить');
      setSaving(false);
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
        zIndex: 90,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-1)',
          border: '1px solid var(--line-2)',
          borderRadius: 'var(--r-xl)',
          padding: 24,
          width: '100%',
          maxWidth: 460,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          boxShadow: 'var(--shadow-3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar name={participant.username} seed={participant.avatarSeed} size={36} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Права участника</h2>
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{participant.username}</span>
          </div>
        </div>

        {participant.role === 'admin' && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--r-md)',
              background: 'var(--bg-2)',
              fontSize: 12,
              color: 'var(--text-2)',
            }}
          >
            У админа всегда полные права. Чтобы настроить отдельные права — сначала снимите его с админа.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ROWS.map((row) => {
            const on = perms[row.key];
            const disabled = participant.role === 'admin' || participant.role === 'guest';
            return (
              <label
                key={row.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 'var(--r-md)',
                  background: 'var(--bg-2)',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.5 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={disabled}
                  onChange={(e) => setPerms((s) => ({ ...s, [row.key]: e.target.checked }))}
                />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 14, color: 'var(--text-0)' }}>{row.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{row.hint}</span>
                </div>
              </label>
            );
          })}
        </div>

        {error && (
          <div style={{ color: 'var(--accent-hi)', fontSize: 12 }}>{error}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={submit}
            disabled={saving || participant.role === 'admin' || participant.role === 'guest'}
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </div>
      </div>
    </div>
  );
}
