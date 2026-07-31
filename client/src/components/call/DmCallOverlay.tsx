import { useEffect, useState } from 'react';
import { Avatar } from '../../shared';
import { Icon } from '../../shared/Icon';
import { useDmCallStore } from '../../stores/dmCallStore';
import type { UseCallApi } from '../../hooks/useCall';
import { startRingbackTone } from '../../utils/sound';

/** «5:32» — длительность разговора. */
function formatDuration(startedAt: number | null): string {
  if (!startedAt) return '';
  const total = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Развёрнутый экран разговора. */
export function DmCallOverlay({ api }: { api: UseCallApi }): React.ReactElement | null {
  const call = useDmCallStore((s) => s.call);
  const peer = useDmCallStore((s) => s.peer);
  const hangup = useDmCallStore((s) => s.hangup);
  const setUiMode = useDmCallStore((s) => s.setUiMode);
  const [, tick] = useState(0);

  const answeredAt = call?.answeredAt ? Date.parse(call.answeredAt) : null;
  const ringing = call?.phase === 'ringing';

  // Секундная перерисовка нужна только ради таймера разговора.
  useEffect(() => {
    if (!answeredAt) return;
    const t = window.setInterval(() => tick((v) => v + 1), 1000);
    return () => window.clearInterval(t);
  }, [answeredAt]);

  // Гудки, пока идёт дозвон: звук следует за нажатием кнопки, поэтому играет.
  useEffect(() => {
    if (!ringing) return;
    return startRingbackTone();
  }, [ringing]);

  if (!call || !peer) return null;

  const speaking = api.speaking.has(peer.id);
  const micOn = call.media[peer.id]?.audio !== false;

  return (
    <div
      role="dialog"
      aria-label={`Звонок с ${peer.username}`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1300,
        background: 'var(--bg-0)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
      }}
    >
      <button
        type="button"
        onClick={() => setUiMode('minimized')}
        title="Свернуть звонок"
        aria-label="Свернуть звонок"
        style={{
          position: 'absolute',
          top: 18,
          left: 18,
          width: 40,
          height: 40,
          borderRadius: 'var(--r-md)',
          border: '1px solid var(--line-2)',
          background: 'var(--bg-2)',
          color: 'var(--text-1)',
          cursor: 'pointer',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Icon name="chevronD" size={18} />
      </button>

      <Avatar
        name={peer.username}
        seed={peer.avatarSeed}
        src={peer.avatarUrl}
        size={148}
        style={
          speaking
            ? { boxShadow: '0 0 0 4px var(--accent), 0 0 32px var(--accent-glow)' }
            : undefined
        }
      />
      <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--text-0)' }}>{peer.username}</div>
      <div style={{ fontSize: 14, color: 'var(--text-2)', minHeight: 20 }}>
        {ringing ? 'Дозвон…' : formatDuration(answeredAt)}
        {!ringing && !micOn && ' · микрофон выключен у собеседника'}
      </div>

      <div style={{ display: 'flex', gap: 14, marginTop: 12 }}>
        <ControlButton
          label={api.myStream?.getAudioTracks()[0]?.enabled === false ? 'Включить микрофон' : 'Выключить микрофон'}
          icon="mic"
          onClick={api.toggleMic}
        />
        <ControlButton label="Завершить" icon="phoneOff" danger onClick={hangup} />
      </div>
    </div>
  );
}

function ControlButton({
  label,
  icon,
  onClick,
  danger,
}: {
  label: string;
  icon: 'mic' | 'phoneOff';
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      style={{
        width: 58,
        height: 58,
        borderRadius: 999,
        border: danger ? 'none' : '1px solid var(--line-2)',
        background: danger ? 'var(--accent)' : 'var(--bg-3)',
        color: danger ? '#fff' : 'var(--text-1)',
        display: 'grid',
        placeItems: 'center',
        cursor: 'pointer',
      }}
    >
      <Icon name={icon} size={22} />
    </button>
  );
}
