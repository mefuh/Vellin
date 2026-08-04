import { useEffect, useRef, useState } from 'react';
import { Avatar } from '../../shared';
import { Icon } from '../../shared/Icon';
import { useDmCallStore } from '../../stores/dmCallStore';
import { screenKey, type UseCallApi } from '../../hooks/useCall';
import { startRingbackTone } from '../../utils/sound';

/** «5:32» — длительность разговора. */
function formatDuration(startedAt: number | null): string {
  if (!startedAt) return '';
  const total = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Один показываемый поток разговора: демонстрация, камера или аватар. */
interface Tile {
  key: string;
  kind: 'screen' | 'camera' | 'avatar';
  stream: MediaStream | null;
  label: string;
  /** Свой поток: он не звучит (иначе эхо) и камера показывается зеркально. */
  mine: boolean;
}

/** Развёрнутый экран разговора. */
export function DmCallOverlay({ api }: { api: UseCallApi }): React.ReactElement | null {
  const call = useDmCallStore((s) => s.call);
  const peer = useDmCallStore((s) => s.peer);
  const hangup = useDmCallStore((s) => s.hangup);
  const setUiMode = useDmCallStore((s) => s.setUiMode);
  const [, tick] = useState(0);
  // Какой поток показан крупно. null — по порядку: демонстрация собеседника,
  // затем его камера. Выбор живёт, пока открыт экран звонка.
  const [mainKey, setMainKey] = useState<string | null>(null);

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
  const peerVideoOn = call.media[peer.id]?.video === true;
  const myVideoOn = api.myStream?.getVideoTracks()[0]?.enabled === true;
  const peerStream = api.remoteStreams.get(peer.id) ?? null;
  const peerScreenStream = api.remoteStreams.get(screenKey(peer.id)) ?? null;

  // Все потоки разговора: демонстрация не заменяет камеру, поэтому их может
  // быть несколько. Первый в списке показывается крупно, остальные — плитками;
  // клик по плитке меняет её с главным потоком местами.
  const tiles: Tile[] = [];
  if (call.media[peer.id]?.screen && peerScreenStream) {
    tiles.push({
      key: 'peer-screen',
      kind: 'screen',
      stream: peerScreenStream,
      label: `Экран: ${peer.username}`,
      mine: false,
    });
  }
  tiles.push(
    peerVideoOn && peerStream
      ? { key: 'peer-camera', kind: 'camera', stream: peerStream, label: peer.username, mine: false }
      : { key: 'peer-avatar', kind: 'avatar', stream: null, label: peer.username, mine: false },
  );
  if (myVideoOn && api.myStream) {
    tiles.push({ key: 'my-camera', kind: 'camera', stream: api.myStream, label: 'Вы', mine: true });
  }

  const main = tiles.find((t) => t.key === mainKey) ?? tiles[0]!;
  const others = tiles.filter((t) => t.key !== main.key);

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

      {main.kind === 'avatar' ? (
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
      ) : (
        <VideoTile
          stream={main.stream!}
          label={main.label}
          muted={main.mine}
          mirrored={main.kind === 'camera' && main.mine}
          contain={main.kind === 'screen'}
        />
      )}
      <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--text-0)' }}>{peer.username}</div>

      {/* Остальные потоки — плитками в углу; клик меняет плитку с главной. */}
      {others.length > 0 && (
        <div
          style={{
            position: 'absolute',
            right: 20,
            bottom: 20,
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            maxWidth: 'min(560px, 60vw)',
          }}
        >
          {others.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setMainKey(t.key)}
              title={`Показать крупно: ${t.label}`}
              aria-label={`Показать крупно: ${t.label}`}
              style={{
                width: 180,
                aspectRatio: '16 / 9',
                padding: 0,
                border: 'none',
                background: 'transparent',
                borderRadius: 'var(--r-md)',
                cursor: 'pointer',
                overflow: 'hidden',
              }}
            >
              {t.kind === 'avatar' ? (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'grid',
                    placeItems: 'center',
                    background: 'var(--bg-2)',
                    border: '1px solid var(--line-2)',
                    borderRadius: 'var(--r-md)',
                  }}
                >
                  <Avatar name={peer.username} seed={peer.avatarSeed} src={peer.avatarUrl} size={48} />
                </div>
              ) : (
                <VideoTile
                  stream={t.stream!}
                  label={t.label}
                  muted={t.mine}
                  mirrored={t.kind === 'camera' && t.mine}
                  contain={t.kind === 'screen'}
                  fill
                />
              )}
            </button>
          ))}
        </div>
      )}
      <div style={{ fontSize: 14, color: 'var(--text-2)', minHeight: 20 }}>
        {ringing ? 'Дозвон…' : formatDuration(answeredAt)}
        {!ringing && !micOn && ' · микрофон выключен у собеседника'}
      </div>

      <div style={{ display: 'flex', gap: 14, marginTop: 12 }}>
        <ControlButton
          label={api.myStream?.getAudioTracks()[0]?.enabled === false ? 'Включить микрофон' : 'Выключить микрофон'}
          icon={api.myStream?.getAudioTracks()[0]?.enabled === false ? 'micOff' : 'mic'}
          onClick={api.toggleMic}
        />
        <ControlButton
          label={myVideoOn ? 'Выключить камеру' : 'Включить камеру'}
          icon={myVideoOn ? 'video' : 'videoOff'}
          onClick={() => void api.toggleCamera()}
        />
        {/* Демонстрацию умеет вести только клиент для Windows; здесь кнопка
            нужна, чтобы о такой возможности вообще узнали. */}
        <ControlButton
          label="Демонстрация экрана доступна в приложении для Windows"
          icon="cast"
          disabled
          onClick={() => {}}
        />
        <ControlButton label="Завершить" icon="phoneOff" danger onClick={hangup} />
      </div>
    </div>
  );
}

/** Кадр видео: главный во всю ширину либо плитка в углу. */
function VideoTile({
  stream,
  label,
  muted,
  mirrored,
  contain,
  fill,
}: {
  stream: MediaStream;
  label: string;
  muted?: boolean;
  mirrored?: boolean;
  /** Демонстрацию показываем целиком: обрезать чужой экран нельзя. */
  contain?: boolean;
  /** Растянуть на размер родителя — режим плитки. */
  fill?: boolean;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    // Автозапуск может не сработать без жеста — тогда кадр просто замрёт,
    // звук при этом идёт через общий микшер и не страдает.
    void el.play().catch(() => {});
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      aria-label={label}
      style={{
        width: '100%',
        maxWidth: fill ? undefined : 'min(960px, 88vw)',
        maxHeight: fill ? undefined : '56vh',
        height: fill ? '100%' : undefined,
        objectFit: contain ? 'contain' : 'cover',
        borderRadius: fill ? 'var(--r-md)' : 'var(--r-lg)',
        background: 'var(--bg-2)',
        border: '1px solid var(--line-2)',
        transform: mirrored ? 'scaleX(-1)' : undefined,
      }}
    />
  );
}

function ControlButton({
  label,
  icon,
  onClick,
  danger,
  disabled,
}: {
  label: string;
  icon: 'mic' | 'micOff' | 'video' | 'videoOff' | 'phoneOff' | 'cast';
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      style={{
        width: 58,
        height: 58,
        borderRadius: 999,
        border: danger ? 'none' : '1px solid var(--line-2)',
        background: danger ? 'var(--accent)' : 'var(--bg-3)',
        color: danger ? '#fff' : disabled ? 'var(--text-3)' : 'var(--text-1)',
        display: 'grid',
        placeItems: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <Icon name={icon} size={22} />
    </button>
  );
}
