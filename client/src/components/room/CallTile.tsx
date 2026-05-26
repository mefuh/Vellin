import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CallMember } from '@vellin/shared';
import { Avatar, Icon } from '../../shared';
import { useCallSettingsStore } from '../../stores/callSettingsStore';

// Note: video mirroring is applied at the source (canvas-flipped track in
// `useCall`), so peers and self see the same image. No CSS transform here.

export interface CallTileProps {
  userId: string;
  username: string;
  avatarSeed: string;
  member: CallMember;
  /** Local or remote MediaStream — used both for video render and audio play. */
  stream: MediaStream | null;
  speaking: boolean;
  shape: 'rect' | 'circle';
  /** Tile diameter (circle) or width (rect, height = 9/16). */
  size: number;
  isMe: boolean;
}

/**
 * One participant in the voice/video call. Renders the video tile when the
 * member has their camera on and the stream actually carries a video track;
 * otherwise shows their avatar.
 */
export function CallTile({
  userId,
  username,
  avatarSeed,
  member,
  stream,
  speaking,
  shape,
  size,
  isMe,
}: CallTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const showVideo = member.video && !!stream && stream.getVideoTracks().length > 0;

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !showVideo || !stream) return;
    if (el.srcObject !== stream) el.srcObject = stream;
  }, [showVideo, stream]);

  const isCircle = shape === 'circle';
  const tileWidth = size;
  // Rect tiles let the grid decide width (fills its 1fr cell); only the
  // aspect ratio is fixed. Circles stay an exact square so the round mask
  // doesn't squash. The fallback height is for sizing inner content (avatar).
  const fallbackHeight = isCircle ? tileWidth : Math.round(tileWidth * (9 / 16));
  const speakingRing =
    speaking && member.audio
      ? `0 0 0 2px var(--accent-hi), 0 0 16px 2px rgba(232,70,42,0.45)`
      : `inset 0 0 0 1px var(--line-2)`;

  const label = isMe ? 'Вы' : username;

  // For circular tiles the round mask would clip text — render the name as
  // a sibling underneath instead. Rect tiles keep the inside-bottom pill.
  const media = (
    <div
      title={username}
      style={{
        position: 'relative',
        width: isCircle ? tileWidth : '100%',
        height: isCircle ? tileWidth : undefined,
        aspectRatio: isCircle ? '1 / 1' : '16 / 9',
        borderRadius: isCircle ? '50%' : 14,
        overflow: 'hidden',
        background: 'var(--bg-3)',
        boxShadow: speakingRing,
        transition: 'box-shadow .14s ease',
        flexShrink: 0,
      }}
    >
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isMe}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            background: '#000',
          }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Avatar name={username} seed={avatarSeed} size={Math.round(fallbackHeight * 0.6)} />
        </div>
      )}
      {!member.audio && !isCircle && (
        <span
          aria-label="Микрофон выключен"
          style={{
            position: 'absolute',
            bottom: 6,
            right: 6,
            width: 22,
            height: 22,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(10,8,7,0.78)',
            backdropFilter: 'blur(6px)',
            color: 'var(--text-1)',
          }}
        >
          <Icon name="micOff" size={12} />
        </span>
      )}
      {!isMe && !isCircle && <PeerVolumeControl userId={userId} />}
      {!isCircle && (
        <span
          style={{
            position: 'absolute',
            left: 6,
            bottom: 6,
            maxWidth: 'calc(100% - 36px)',
            padding: '2px 7px',
            borderRadius: 999,
            background: 'rgba(10,8,7,0.7)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            backdropFilter: 'blur(6px)',
          }}
        >
          {label}
        </span>
      )}
      {/* aria reachable text — keeps screen readers informed; visually hidden. */}
      <span style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
        {`Участник ${userId}`}
      </span>
    </div>
  );

  if (!isCircle) return media;

  return (
    <div
      title={username}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        flexShrink: 0,
      }}
    >
      {media}
      <span
        style={{
          maxWidth: tileWidth + 16,
          fontSize: 11,
          fontWeight: 500,
          color: 'var(--text-0)',
          textShadow: '0 1px 3px rgba(0,0,0,0.7)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          padding: '0 4px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {!member.audio && (
          <span
            aria-label="Микрофон выключен"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              color: 'var(--accent-hi)',
              flexShrink: 0,
            }}
          >
            <Icon name="micOff" size={12} />
          </span>
        )}
        {label}
      </span>
    </div>
  );
}

/**
 * Top-right speaker control on remote rect tiles. Click toggles a small
 * popover with a 0–100% slider. Persists per-userId in `callSettingsStore`,
 * applied by `<RemoteAudioMixer>` via the `<audio>` element's `volume` prop.
 */
function PeerVolumeControl({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popPos, setPopPos] = useState<{ top: number; right: number } | null>(null);
  const volume = useCallSettingsStore((s) => s.peerVolumes[userId] ?? 1);
  const setPeerVolume = useCallSettingsStore((s) => s.setPeerVolume);

  // Compute the popover position relative to the button. Lives outside the
  // tile (via portal) so it isn't clipped by the tile's `overflow: hidden`.
  // Re-runs on resize / any ancestor scroll so the popover follows the button.
  useLayoutEffect(() => {
    if (!open) {
      setPopPos(null);
      return;
    }
    const update = (): void => {
      const btn = buttonRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      setPopPos({
        top: r.bottom + 8,
        right: Math.max(8, window.innerWidth - r.right),
      });
    };
    update();
    window.addEventListener('resize', update);
    // `true` → capture phase so we hear ancestor scrolls too.
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent): void => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (buttonRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const muted = volume <= 0;
  const pct = Math.round(volume * 100);

  const toggleMute = (): void => {
    setPeerVolume(userId, muted ? 1 : 0);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        title={muted ? 'Звук собеседника выключен' : `Громкость: ${pct}%`}
        aria-label={`Громкость собеседника: ${pct}%`}
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          zIndex: 2,
          width: 24,
          height: 24,
          borderRadius: '50%',
          padding: 0,
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: open ? 'var(--bg-3)' : 'rgba(10,8,7,0.78)',
          boxShadow: open
            ? 'inset 0 0 0 1px var(--accent-hi)'
            : 'inset 0 0 0 1px transparent',
          backdropFilter: 'blur(6px)',
          color: muted ? 'var(--accent-hi)' : 'var(--text-1)',
          transition: 'background .12s, box-shadow .12s, color .12s',
        }}
      >
        <Icon name={muted ? 'volumeOff' : 'volume'} size={13} />
      </button>
      {open && popPos && createPortal(
        <div
          ref={popoverRef}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Громкость собеседника"
          style={{
            position: 'fixed',
            top: popPos.top,
            right: popPos.right,
            zIndex: 110,
            padding: '12px 14px',
            background: 'rgba(10,8,7,0.96)',
            border: '1px solid var(--line-2)',
            borderRadius: 12,
            boxShadow: 'var(--shadow-3)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            backdropFilter: 'blur(10px)',
          }}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleMute(); }}
            title={muted ? 'Включить звук' : 'Выключить звук'}
            aria-label={muted ? 'Включить звук' : 'Выключить звук'}
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              padding: 0,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              color: muted ? 'var(--accent-hi)' : 'var(--text-1)',
              transition: 'color .12s, background .12s',
              flexShrink: 0,
            }}
          >
            <Icon name={muted ? 'volumeOff' : 'volume'} size={16} />
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setPeerVolume(userId, parseFloat(e.target.value))}
            aria-label="Громкость"
            style={{
              width: 150,
              height: 20,
              accentColor: 'var(--accent-hi)',
              cursor: 'pointer',
              margin: 0,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: muted ? 'var(--text-2)' : 'var(--text-0)',
              minWidth: 42,
              textAlign: 'right',
              fontVariantNumeric: 'tabular-nums',
              flexShrink: 0,
            }}
          >
            {pct}%
          </span>
        </div>,
        document.body,
      )}
    </>
  );
}
