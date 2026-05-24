import { useEffect, useRef } from 'react';
import type { CallMember } from '@vellin/shared';
import { Avatar, Icon } from '../../shared';

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
  const tileHeight = isCircle ? size : Math.round(size * (9 / 16));
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
        width: tileWidth,
        height: tileHeight,
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
          <Avatar name={username} seed={avatarSeed} size={Math.round(tileHeight * 0.6)} />
        </div>
      )}
      {!member.audio && (
        <span
          aria-label="Микрофон выключен"
          style={{
            position: 'absolute',
            bottom: isCircle ? '10%' : 6,
            right: isCircle ? '10%' : 6,
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
        }}
      >
        {label}
      </span>
    </div>
  );
}
