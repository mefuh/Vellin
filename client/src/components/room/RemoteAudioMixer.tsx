import { useEffect, useRef } from 'react';
import { useCallContextOptional } from '../../hooks/CallContext';
import { ownerOfStreamKey } from '../../hooks/useCall';
import { useCallSettingsStore } from '../../stores/callSettingsStore';

/**
 * Renders an invisible `<audio>` per remote peer so call audio plays
 * regardless of which call UI is currently mounted (chat panel, fullscreen
 * overlay, or neither). Mount once at the Room.tsx level. Per-peer playback
 * volume comes from `callSettingsStore` and is applied live to each element.
 */
export function RemoteAudioMixer({ streams }: { streams?: Map<string, MediaStream> } = {}) {
  // Комната берёт потоки из своего контекста; звонок в личных сообщениях живёт
  // выше роутера и передаёт их напрямую.
  const ctx = useCallContextOptional();
  const remoteStreams = streams ?? ctx?.remoteStreams ?? new Map<string, MediaStream>();
  return (
    <div aria-hidden style={{ display: 'none' }}>
      {/* Ключ может быть и «userId», и «userId:screen» — звук демонстрации
          играется наравне с голосом, а громкость берётся по владельцу. */}
      {[...remoteStreams.entries()].map(([key, stream]) => (
        <RemoteAudio key={key} userId={ownerOfStreamKey(key)} stream={stream} />
      ))}
    </div>
  );
}

/** Умеет ли браузер выводить звук в выбранное устройство (не все умеют). */
export const canPickSpeaker = (): boolean =>
  typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

function RemoteAudio({ userId, stream }: { userId: string; stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const volume = useCallSettingsStore((s) => s.peerVolumes[userId] ?? 1);
  const speakerId = useCallSettingsStore((s) => s.preferredSpeakerId);

  // Выбранный динамик. Поддержки может не быть — тогда звук идёт в системный,
  // и настройка просто не действует.
  useEffect(() => {
    const el = ref.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!el?.setSinkId) return;
    void el.setSinkId(speakerId ?? '').catch(() => undefined);
  }, [speakerId, stream]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    console.log(
      `[call] RemoteAudio: stream=${stream.id} tracks=${stream
        .getTracks()
        .map((t) => `${t.kind}(enabled=${t.enabled},muted=${t.muted})`)
        .join(',')}`,
    );

    let cancelled = false;
    let removeGestureRetry: (() => void) | null = null;

    el.play().then(
      () => {
        if (!cancelled) console.log(`[call] RemoteAudio: play() OK for ${stream.id}`);
      },
      (err) => {
        if (cancelled) return;
        console.warn(`[call] RemoteAudio: play() FAIL for ${stream.id}`, err);
        // iOS: автозапуск аудио со звуком блокируется до жеста пользователя.
        // Пробуем снова на ближайшее касание/клик и снимаем слушатели, как
        // только воспроизведение реально стартовало.
        const retry = (): void => {
          void el.play().then(
            () => {
              if (removeGestureRetry) removeGestureRetry();
            },
            () => undefined,
          );
        };
        const opts: AddEventListenerOptions = { capture: true };
        document.addEventListener('pointerdown', retry, opts);
        document.addEventListener('touchend', retry, opts);
        removeGestureRetry = () => {
          document.removeEventListener('pointerdown', retry, opts);
          document.removeEventListener('touchend', retry, opts);
          removeGestureRetry = null;
        };
      },
    );

    return () => {
      cancelled = true;
      if (removeGestureRetry) removeGestureRetry();
    };
  }, [stream]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.volume = volume;
  }, [volume]);

  return <audio ref={ref} autoPlay playsInline />;
}
