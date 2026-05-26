import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { ParticipantInfo } from '@vellin/shared';
import { Avatar, Icon } from '../../shared';
import { useCallContext } from '../../hooks/CallContext';
import { useCallSettingsStore, type CircleSize } from '../../stores/callSettingsStore';
import { useRoomStore } from '../../stores/roomStore';

const CIRCLE_SIZE_OPTIONS: ReadonlyArray<{ value: CircleSize; label: string }> = [
  { value: 'small', label: 'Маленькие' },
  { value: 'standard', label: 'Стандартные' },
  { value: 'large', label: 'Большие' },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Centralized call preferences: mic / camera device selection, self-view
 * mirroring, per-peer playback volume. Mounted via portal so the backdrop
 * covers the whole viewport regardless of where CallControls lives. Device
 * selectors are only meaningful once the user is in the call (labels are
 * empty otherwise); show a hint instead in that case.
 */
export function CallSettingsModal({ open, onClose }: Props) {
  const {
    state,
    availableDevices,
    switchMic,
    switchCamera,
    remoteStreams,
  } = useCallContext();
  const participants = useRoomStore((s) => s.participants);
  const preferredMicId = useCallSettingsStore((s) => s.preferredMicId);
  const preferredCameraId = useCallSettingsStore((s) => s.preferredCameraId);
  const mirrorSelfVideo = useCallSettingsStore((s) => s.mirrorSelfVideo);
  const circleSize = useCallSettingsStore((s) => s.circleSize);
  const tilePositions = useCallSettingsStore((s) => s.tilePositions);
  const setPreferredMicId = useCallSettingsStore((s) => s.setPreferredMicId);
  const setPreferredCameraId = useCallSettingsStore((s) => s.setPreferredCameraId);
  const setMirrorSelfVideo = useCallSettingsStore((s) => s.setMirrorSelfVideo);
  const setCircleSize = useCallSettingsStore((s) => s.setCircleSize);
  const resetTilePositions = useCallSettingsStore((s) => s.resetTilePositions);

  // Close on ESC.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const participantsById = useMemo(() => {
    const m = new Map<string, ParticipantInfo>();
    for (const p of participants) m.set(p.userId, p);
    return m;
  }, [participants]);

  if (!open) return null;

  const inCall = state === 'in';
  const remotePeers = [...remoteStreams.keys()];

  const onPickMic = (id: string): void => {
    if (inCall) void switchMic(id);
    else setPreferredMicId(id);
  };
  const onPickCamera = (id: string): void => {
    if (inCall) void switchCamera(id);
    else setPreferredCameraId(id);
  };

  const modal = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(10,8,7,0.66)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px max(16px, 3vw)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Настройки звонка"
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: 'calc(100svh - 48px)',
          overflow: 'auto',
          background: 'var(--bg-1)',
          border: '1px solid var(--line-2)',
          borderRadius: 'var(--r-2xl)',
          boxShadow: 'var(--shadow-3)',
          padding: '20px 22px 22px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text-0)' }}>
            Настройки звонка
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-2)',
              cursor: 'pointer',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
            }}
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <Section label="Микрофон">
          <DeviceSelect
            kind="mic"
            devices={availableDevices.mics}
            value={preferredMicId}
            inCall={inCall}
            onChange={onPickMic}
          />
        </Section>

        <Section label="Камера">
          <DeviceSelect
            kind="camera"
            devices={availableDevices.cameras}
            value={preferredCameraId}
            inCall={inCall}
            onChange={onPickCamera}
          />
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginTop: 12,
              color: 'var(--text-1)',
              fontSize: 13,
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={mirrorSelfVideo}
              onChange={(e) => setMirrorSelfVideo(e.target.checked)}
              style={{ accentColor: 'var(--accent-hi)' }}
            />
            Отзеркалить видео (видят все — изображение инвертируется на лету)
          </label>
        </Section>

        <Section label="Размер кружков в полноэкранном плеере">
          <div
            role="radiogroup"
            aria-label="Размер кружков"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 6,
              padding: 4,
              background: 'var(--bg-2)',
              borderRadius: 10,
              border: '1px solid var(--line-2)',
            }}
          >
            {CIRCLE_SIZE_OPTIONS.map((opt) => {
              const checked = circleSize === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => setCircleSize(opt.value)}
                  style={{
                    padding: '8px 10px',
                    background: checked ? 'var(--bg-3)' : 'transparent',
                    color: checked ? 'var(--text-0)' : 'var(--text-2)',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: checked ? 600 : 500,
                    boxShadow: checked ? 'inset 0 0 0 1px var(--line-2)' : 'none',
                    transition: 'background .12s, color .12s',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p style={{ margin: '6px 2px 0', color: 'var(--text-2)', fontSize: 12 }}>
            Меняет размер плиток с видео и аватарок в правом верхнем углу плеера.
          </p>
          {Object.keys(tilePositions).length > 0 && (
            <button
              type="button"
              onClick={resetTilePositions}
              style={{
                alignSelf: 'flex-start',
                marginTop: 10,
                padding: '6px 12px',
                background: 'transparent',
                color: 'var(--text-1)',
                border: '1px solid var(--line-2)',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Сбросить расположение кружков ({Object.keys(tilePositions).length})
            </button>
          )}
        </Section>

        <Section label={`Громкость собеседников · ${remotePeers.length}`}>
          {remotePeers.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 13 }}>
              В звонке пока никого нет.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {remotePeers.map((userId) => (
                <PeerVolumeRow
                  key={userId}
                  userId={userId}
                  participant={participantsById.get(userId) ?? null}
                />
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h4
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-2)',
        }}
      >
        {label}
      </h4>
      {children}
    </section>
  );
}

function DeviceSelect({
  kind,
  devices,
  value,
  inCall,
  onChange,
}: {
  kind: 'mic' | 'camera';
  devices: MediaDeviceInfo[];
  value: string | null;
  inCall: boolean;
  onChange: (id: string) => void;
}) {
  const hasLabels = devices.some((d) => d.label.length > 0);
  if (devices.length === 0 || !hasLabels) {
    return (
      <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 13 }}>
        {inCall
          ? 'Не удалось получить список устройств.'
          : 'Зайдите в звонок, чтобы выбрать устройство — браузер показывает названия только после первого разрешения.'}
      </p>
    );
  }
  const fallbackLabel = kind === 'mic' ? 'Микрофон' : 'Камера';
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%',
        padding: '10px 12px',
        background: 'var(--bg-2)',
        color: 'var(--text-0)',
        border: '1px solid var(--line-2)',
        borderRadius: 10,
        fontSize: 14,
        outline: 'none',
        cursor: 'pointer',
      }}
    >
      <option value="">Системный по умолчанию</option>
      {devices.map((d) => (
        <option key={d.deviceId} value={d.deviceId}>
          {d.label || `${fallbackLabel} ${d.deviceId.slice(0, 6)}`}
        </option>
      ))}
    </select>
  );
}

function PeerVolumeRow({
  userId,
  participant,
}: {
  userId: string;
  participant: ParticipantInfo | null;
}) {
  const volume = useCallSettingsStore((s) => s.peerVolumes[userId] ?? 1);
  const setPeerVolume = useCallSettingsStore((s) => s.setPeerVolume);
  const username = participant?.username ?? userId.slice(0, 6);
  const avatarSeed = participant?.avatarSeed ?? userId;
  const pct = Math.round(volume * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Avatar name={username} seed={avatarSeed} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: 'var(--text-0)',
            fontSize: 13,
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {username}
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setPeerVolume(userId, parseFloat(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--accent-hi)' }}
        />
      </div>
      <span
        style={{
          minWidth: 40,
          textAlign: 'right',
          color: 'var(--text-2)',
          fontSize: 12,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {pct}%
      </span>
    </div>
  );
}
