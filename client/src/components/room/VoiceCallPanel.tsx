import { useMemo, useState } from 'react';
import type { CallMember, ParticipantInfo } from '@vellin/shared';
import { CALL_MAX_VIDEO, CALL_MAX_VOICE } from '@vellin/shared';
import { Button, Icon } from '../../shared';
import { useRoomStore } from '../../stores/roomStore';
import { useCallContext } from '../../hooks/CallContext';
import { CallControls } from './CallControls';
import { CallTile } from './CallTile';
import { CallSettingsModal } from './CallSettingsModal';

/**
 * Embedded inside `RoomChat.ChatBody` between the participants strip and the
 * messages list. Shown whenever an active call exists or the local user is in
 * one. Audio playback lives separately in `<RemoteAudioMixer>` so the audio
 * survives even when this panel is unmounted (e.g. mobile fullscreen).
 */
export function VoiceCallPanel() {
  const callMembers = useRoomStore((s) => s.call.members);
  const participants = useRoomStore((s) => s.participants);
  const you = useRoomStore((s) => s.you);
  const myMedia = useRoomStore((s) => s.myMedia);
  const myCallState = useRoomStore((s) => s.myCallState);
  const { myStream, remoteStreams, speaking, join, leave, toggleMic, toggleCamera, permissionError } =
    useCallContext();

  const iAmIn = myCallState === 'in';
  const myUserId = you?.userId ?? null;
  const myKind = you?.kind ?? null;
  const callFull = callMembers.length >= CALL_MAX_VOICE;
  const videoCount = callMembers.filter((m) => m.video).length;
  const cameraDisabled = !iAmIn || (!myMedia.video && videoCount >= CALL_MAX_VIDEO);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Index participants by id for quick name/avatar lookup.
  const participantsById = useMemo(() => {
    const m = new Map<string, ParticipantInfo>();
    for (const p of participants) m.set(p.userId, p);
    return m;
  }, [participants]);

  // Hide entirely when no one's in the call and the local user can't / hasn't started one.
  if (callMembers.length === 0 && !iAmIn) return null;

  return (
    <section
      style={{
        borderBottom: '1px solid var(--line-1)',
        padding: '12px 14px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        background: 'var(--bg-1)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: 'var(--text-2)',
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        <Icon name="phone" size={13} />
        Голосовой чат · {callMembers.length}
      </header>

      {callMembers.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 10,
          }}
        >
          {callMembers.map((m) => (
            <TileFor
              key={m.userId}
              member={m}
              participant={participantsById.get(m.userId) ?? null}
              isMe={m.userId === myUserId}
              myStream={myStream}
              remoteStream={remoteStreams.get(m.userId) ?? null}
              speaking={speaking.has(m.userId === myUserId ? '__self__' : m.userId)}
            />
          ))}
        </div>
      )}

      {permissionError === 'denied' && !iAmIn && (
        <p
          style={{
            margin: 0,
            padding: '8px 12px',
            borderRadius: 'var(--r-md)',
            background: 'rgba(209,39,27,0.10)',
            color: 'var(--accent-hi)',
            fontSize: 12,
          }}
        >
          Нет доступа к микрофону. Разрешите его в настройках браузера.
        </p>
      )}

      {iAmIn ? (
        <CallControls
          micOn={myMedia.audio}
          cameraOn={myMedia.video}
          cameraDisabled={cameraDisabled}
          cameraDisabledHint={
            !iAmIn ? undefined : `Камеры заняты (${videoCount}/${CALL_MAX_VIDEO})`
          }
          onToggleMic={toggleMic}
          onToggleCamera={() => void toggleCamera()}
          onOpenSettings={() => setSettingsOpen(true)}
          onLeave={leave}
        />
      ) : myKind === 'guest' ? (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-2)' }}>
          Звонок доступен только зарегистрированным пользователям.
        </p>
      ) : (
        <Button
          variant="primary"
          icon="phone"
          size="sm"
          disabled={callFull || myCallState === 'connecting'}
          onClick={() => void join({ withVideo: false })}
        >
          {callFull
            ? `Звонок полон (${CALL_MAX_VOICE}/${CALL_MAX_VOICE})`
            : myCallState === 'connecting'
              ? 'Подключаемся…'
              : 'Войти в звонок'}
        </Button>
      )}
      <CallSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </section>
  );
}

function TileFor({
  member,
  participant,
  isMe,
  myStream,
  remoteStream,
  speaking,
}: {
  member: CallMember;
  participant: ParticipantInfo | null;
  isMe: boolean;
  myStream: MediaStream | null;
  remoteStream: MediaStream | null;
  speaking: boolean;
}) {
  const username = participant?.username ?? member.userId.slice(0, 6);
  const avatarSeed = participant?.avatarSeed ?? member.userId;
  const stream = isMe ? myStream : remoteStream;
  return (
    <CallTile
      userId={member.userId}
      username={username}
      avatarSeed={avatarSeed}
      member={member}
      stream={stream}
      speaking={speaking}
      shape="rect"
      size={150}
      isMe={isMe}
    />
  );
}
