import type { CSSProperties } from 'react';
import { Icon, type IconName } from '../../shared';

interface CallControlsProps {
  micOn: boolean;
  cameraOn: boolean;
  cameraDisabled?: boolean;
  cameraDisabledHint?: string;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onOpenSettings: () => void;
  onLeave: () => void;
}

/** Toolbar inside the voice-chat panel: mute, camera, settings, leave. */
export function CallControls({
  micOn,
  cameraOn,
  cameraDisabled,
  cameraDisabledHint,
  onToggleMic,
  onToggleCamera,
  onOpenSettings,
  onLeave,
}: CallControlsProps) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <ControlButton
        icon={micOn ? 'mic' : 'micOff'}
        active={micOn}
        title={micOn ? 'Выключить микрофон' : 'Включить микрофон'}
        onClick={onToggleMic}
      />
      <ControlButton
        icon={cameraOn ? 'video' : 'videoOff'}
        active={cameraOn}
        disabled={cameraDisabled}
        title={cameraDisabled ? (cameraDisabledHint ?? 'Камера недоступна') : cameraOn ? 'Выключить камеру' : 'Включить камеру'}
        onClick={onToggleCamera}
      />
      <ControlButton
        icon="settings"
        title="Настройки звонка"
        onClick={onOpenSettings}
      />
      <ControlButton
        icon="phoneOff"
        title="Покинуть звонок"
        onClick={onLeave}
        tone="danger"
      />
    </div>
  );
}

function ControlButton({
  icon,
  active,
  disabled,
  title,
  onClick,
  tone = 'default',
}: {
  icon: IconName;
  active?: boolean;
  disabled?: boolean;
  title: string;
  onClick: () => void;
  tone?: 'default' | 'danger';
}) {
  const palette: CSSProperties =
    tone === 'danger'
      ? {
          background: 'rgba(209, 39, 27, 0.18)',
          color: 'var(--accent-hi)',
          boxShadow: 'inset 0 0 0 1px rgba(209,39,27,0.3)',
        }
      : active
        ? {
            background: 'var(--bg-3)',
            color: 'var(--text-0)',
            boxShadow: 'inset 0 0 0 1px var(--line-2)',
          }
        : {
            background: 'transparent',
            color: 'var(--text-2)',
            boxShadow: 'inset 0 0 0 1px var(--line-2)',
          };

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      style={{
        width: 38,
        height: 38,
        borderRadius: 999,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background .12s, color .12s',
        ...palette,
      }}
    >
      <Icon name={icon} size={17} />
    </button>
  );
}
