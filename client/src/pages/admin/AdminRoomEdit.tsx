import { useState } from 'react';
import type { AdminRoomSummary, UpdateRoomRequest } from '@vellin/shared';
import { adminApi } from '../../api/admin';
import { ApiHttpError } from '../../api/client';
import { Button } from '../../shared';
import { ConfirmShell, DialogActions } from './AdminUsers';

type PasswordMode = 'keep' | 'reset' | 'set';

export function AdminRoomEdit({
  room,
  onClose,
  onSaved,
}: {
  room: AdminRoomSummary;
  onClose: () => void;
  onSaved: (u: AdminRoomSummary) => void;
}) {
  const [name, setName] = useState(room.name);
  const [isPrivate, setIsPrivate] = useState(room.isPrivate);
  const [allowGuests, setAllowGuests] = useState(room.allowGuests);
  const [hostOnly, setHostOnly] = useState(room.hostOnlyControl);
  const [maxParticipants, setMaxParticipants] = useState(room.maxParticipants);
  const [pwMode, setPwMode] = useState<PasswordMode>('keep');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const patch: UpdateRoomRequest = {};
    if (name.trim() && name.trim() !== room.name) patch.name = name.trim();
    if (isPrivate !== room.isPrivate) patch.isPrivate = isPrivate;
    if (allowGuests !== room.allowGuests) patch.allowGuests = allowGuests;
    if (hostOnly !== room.hostOnlyControl) patch.hostOnlyControl = hostOnly;
    if (maxParticipants !== room.maxParticipants) patch.maxParticipants = maxParticipants;
    if (pwMode === 'reset') patch.password = null;
    if (pwMode === 'set') {
      if (newPassword.length < 4) {
        setError('Пароль должен быть от 4 символов');
        setBusy(false);
        return;
      }
      patch.password = newPassword;
    }
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    try {
      const r = await adminApi.updateRoom(room.id, patch);
      onSaved(r.room);
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmShell title="Изменить комнату" onClose={onClose}>
      <Field label="Название">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          style={inputStyle}
        />
      </Field>
      <Field label="Максимум участников">
        <input
          type="number"
          min={2}
          max={50}
          value={maxParticipants}
          onChange={(e) => setMaxParticipants(Math.max(2, Math.min(50, Number(e.target.value) || 2)))}
          style={inputStyle}
        />
      </Field>
      <Toggle label="Приватная" checked={isPrivate} onChange={setIsPrivate} />
      <Toggle label="Разрешить гостей" checked={allowGuests} onChange={setAllowGuests} />
      <Toggle label="Только владелец управляет плеером" checked={hostOnly} onChange={setHostOnly} />

      {isPrivate && (
        <Field label="Пароль">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <RadioPill checked={pwMode === 'keep'} onClick={() => setPwMode('keep')}>Оставить</RadioPill>
            <RadioPill checked={pwMode === 'set'} onClick={() => setPwMode('set')}>Новый</RadioPill>
            <RadioPill checked={pwMode === 'reset'} onClick={() => setPwMode('reset')}>Сбросить</RadioPill>
          </div>
          {pwMode === 'set' && (
            <input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="новый пароль (>=4 символов)"
              style={{ ...inputStyle, marginTop: 6 }}
            />
          )}
        </Field>
      )}

      {error && <span style={{ color: 'var(--accent-hi)', fontSize: 13 }}>{error}</span>}

      <DialogActions>
        <Button variant="ghost" onClick={onClose}>Отмена</Button>
        <Button variant="primary" disabled={busy} onClick={() => void submit()}>
          Сохранить
        </Button>
      </DialogActions>
    </ConfirmShell>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 36,
  padding: '0 12px',
  borderRadius: 'var(--r-md)',
  border: '1px solid var(--line-2)',
  background: 'var(--bg-2)',
  color: 'var(--text-0)',
  fontFamily: 'inherit',
  fontSize: 13,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-2)' }}>
      {label}
      {children}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        cursor: 'pointer',
        background: 'var(--bg-2)',
        borderRadius: 'var(--r-md)',
        padding: '10px 12px',
        boxShadow: 'inset 0 0 0 1px var(--line-1)',
      }}
    >
      <span style={{ color: 'var(--text-0)', fontSize: 13 }}>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function RadioPill({
  checked,
  onClick,
  children,
}: {
  checked: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 30,
        padding: '0 12px',
        borderRadius: 999,
        border: 'none',
        cursor: 'pointer',
        fontSize: 12,
        background: checked ? 'var(--accent-soft)' : 'var(--bg-3)',
        color: checked ? 'var(--accent-hi)' : 'var(--text-1)',
        boxShadow: checked
          ? 'inset 0 0 0 1px rgba(209,39,27,0.3)'
          : 'inset 0 0 0 1px var(--line-2)',
      }}
    >
      {children}
    </button>
  );
}
