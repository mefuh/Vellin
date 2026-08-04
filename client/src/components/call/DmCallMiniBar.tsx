import { useEffect, useState } from 'react';
import { Avatar } from '../../shared';
import { Icon } from '../../shared/Icon';
import { useDmCallStore } from '../../stores/dmCallStore';
import type { UseCallApi } from '../../hooks/useCall';

function formatDuration(startedAt: number | null): string {
  if (!startedAt) return '';
  const total = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Свёрнутый звонок: узкая полоса поверх сайта. Видео при этом не монтируется —
 * дорожки продолжают идти, поэтому разворот мгновенный и ничего не
 * пересогласовывается.
 */
export function DmCallMiniBar({ api }: { api: UseCallApi }): React.ReactElement | null {
  const call = useDmCallStore((s) => s.call);
  const peer = useDmCallStore((s) => s.peer);
  const hangup = useDmCallStore((s) => s.hangup);
  const setUiMode = useDmCallStore((s) => s.setUiMode);
  const [, tick] = useState(0);

  const answeredAt = call?.answeredAt ? Date.parse(call.answeredAt) : null;

  useEffect(() => {
    if (!answeredAt) return;
    const t = window.setInterval(() => tick((v) => v + 1), 1000);
    return () => window.clearInterval(t);
  }, [answeredAt]);

  if (!call || !peer) return null;

  const micOff = api.myStream?.getAudioTracks()[0]?.enabled === false;
  const speaking = api.speaking.has(peer.id);
  const peerScreen = call.media[peer.id]?.screen === true;

  return (
    <div
      style={{
        position: 'fixed',
        // Над мобильной панелью навигации, но ниже модальных окон.
        bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 900,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 10px 8px 12px',
        borderRadius: 999,
        background: 'var(--bg-2)',
        border: '1px solid var(--line-2)',
        boxShadow: 'var(--shadow-3)',
        maxWidth: 'calc(100vw - 24px)',
      }}
    >
      <button
        type="button"
        onClick={() => setUiMode('expanded')}
        title="Развернуть звонок"
        aria-label="Развернуть звонок"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: 'var(--text-0)',
          minWidth: 0,
        }}
      >
        <Avatar
          name={peer.username}
          seed={peer.avatarSeed}
          src={peer.avatarUrl}
          size={30}
          style={speaking ? { boxShadow: '0 0 0 2px var(--accent)' } : undefined}
        />
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              maxWidth: 140,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {peer.username}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>
            {call.phase === 'ringing' ? 'Дозвон…' : formatDuration(answeredAt)}
            {/* Демонстрация идёт и в свёрнутом звонке — про неё надо помнить. */}
            {peerScreen && ' · демонстрация экрана'}
          </span>
        </span>
      </button>

      <MiniButton
        label={micOff ? 'Включить микрофон' : 'Выключить микрофон'}
        icon={micOff ? 'micOff' : 'mic'}
        onClick={api.toggleMic}
        active={micOff}
      />
      <MiniButton label="Завершить" icon="phoneOff" onClick={hangup} danger />
    </div>
  );
}

function MiniButton({
  label,
  icon,
  onClick,
  danger,
  active,
}: {
  label: string;
  icon: 'mic' | 'micOff' | 'phoneOff';
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      style={{
        width: 34,
        height: 34,
        borderRadius: 999,
        border: 'none',
        background: danger ? 'var(--accent)' : active ? 'var(--bg-4)' : 'var(--bg-3)',
        color: danger ? '#fff' : 'var(--text-1)',
        display: 'grid',
        placeItems: 'center',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}
