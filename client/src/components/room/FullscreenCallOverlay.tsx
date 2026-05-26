import { useMemo } from 'react';
import type { CallMember, ParticipantInfo } from '@vellin/shared';
import { useRoomStore } from '../../stores/roomStore';
import { useCallContext } from '../../hooks/CallContext';
import { useCallSettingsStore, type CircleSize } from '../../stores/callSettingsStore';
import { Avatar } from '../../shared';
import { CallTile } from './CallTile';

// Pixel sizes for the three discrete options the user can pick in the call
// settings modal. Audio-only bubble shrinks proportionally so the overlap
// row still fits along the right edge of the player.
const CIRCLE_PX: Record<CircleSize, number> = { small: 78, standard: 108, large: 144 };
const BUBBLE_PX: Record<CircleSize, number> = { small: 30, standard: 38, large: 48 };
const BUBBLE_AVATAR_PX: Record<CircleSize, number> = { small: 24, standard: 32, large: 40 };
const BUBBLE_OVERLAP_PX: Record<CircleSize, number> = { small: -8, standard: -10, large: -14 };

interface FullscreenCallOverlayProps {
  /** Mirrors VideoPlayer's `controlsVisible` so the labels fade with the chrome. */
  expanded: boolean;
}

/**
 * Telegram-style circular webcam tiles stacked vertically in the top-right of
 * the player. Audio-only participants collapse into a small overlapping
 * avatar row. Audio playback itself lives in `<RemoteAudioMixer>` at the
 * Room.tsx level so it survives every overlay mount/unmount.
 */
export function FullscreenCallOverlay({ expanded }: FullscreenCallOverlayProps) {
  const callMembers = useRoomStore((s) => s.call.members);
  const participants = useRoomStore((s) => s.participants);
  const you = useRoomStore((s) => s.you);
  const circleSize = useCallSettingsStore((s) => s.circleSize);
  const { myStream, remoteStreams, speaking } = useCallContext();

  const tilePx = CIRCLE_PX[circleSize];
  const bubblePx = BUBBLE_PX[circleSize];
  const bubbleAvatarPx = BUBBLE_AVATAR_PX[circleSize];
  const bubbleOverlapPx = BUBBLE_OVERLAP_PX[circleSize];

  const participantsById = useMemo(() => {
    const m = new Map<string, ParticipantInfo>();
    for (const p of participants) m.set(p.userId, p);
    return m;
  }, [participants]);

  const myUserId = you?.userId ?? null;

  if (callMembers.length === 0) return null;

  const withVideo: CallMember[] = [];
  const audioOnly: CallMember[] = [];
  for (const m of callMembers) (m.video ? withVideo : audioOnly).push(m);

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 3,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 14,
        opacity: expanded ? 1 : 0.85,
        transition: 'opacity 180ms ease',
        pointerEvents: 'none',
      }}
    >
      {withVideo.map((m) => {
        const isMe = m.userId === myUserId;
        const p = participantsById.get(m.userId) ?? null;
        return (
          <CallTile
            key={m.userId}
            userId={m.userId}
            username={p?.username ?? m.userId.slice(0, 6)}
            avatarSeed={p?.avatarSeed ?? m.userId}
            member={m}
            stream={isMe ? myStream : remoteStreams.get(m.userId) ?? null}
            speaking={speaking.has(m.userId)}
            shape="circle"
            size={tilePx}
            isMe={isMe}
          />
        );
      })}

      {audioOnly.length > 0 && (
        <div style={{ display: 'flex', gap: -8, paddingLeft: 8 }}>
          {audioOnly.map((m, i) => {
            const p = participantsById.get(m.userId) ?? null;
            const isSpeaking = speaking.has(m.userId);
            return (
              <div
                key={m.userId}
                title={p?.username}
                style={{
                  marginLeft: i === 0 ? 0 : bubbleOverlapPx,
                  width: bubblePx,
                  height: bubblePx,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  background: 'var(--bg-3)',
                  border: '2px solid rgba(20,16,14,0.62)',
                  boxShadow:
                    isSpeaking && m.audio
                      ? '0 0 0 2px var(--accent-hi), 0 0 12px rgba(232,70,42,0.4)'
                      : 'none',
                  transition: 'box-shadow .14s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Avatar
                  name={p?.username ?? m.userId}
                  seed={p?.avatarSeed ?? m.userId}
                  size={bubbleAvatarPx}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
