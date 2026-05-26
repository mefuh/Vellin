import { useEffect, useRef } from 'react';
import { useCallContext } from '../../hooks/CallContext';
import { useCallSettingsStore } from '../../stores/callSettingsStore';

/**
 * Renders an invisible `<audio>` per remote peer so call audio plays
 * regardless of which call UI is currently mounted (chat panel, fullscreen
 * overlay, or neither). Mount once at the Room.tsx level. Per-peer playback
 * volume comes from `callSettingsStore` and is applied live to each element.
 */
export function RemoteAudioMixer() {
  const { remoteStreams } = useCallContext();
  return (
    <div aria-hidden style={{ display: 'none' }}>
      {[...remoteStreams.entries()].map(([userId, stream]) => (
        <RemoteAudio key={userId} userId={userId} stream={stream} />
      ))}
    </div>
  );
}

function RemoteAudio({ userId, stream }: { userId: string; stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const volume = useCallSettingsStore((s) => s.peerVolumes[userId] ?? 1);

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
    el.play().then(
      () => console.log(`[call] RemoteAudio: play() OK for ${stream.id}`),
      (err) => console.warn(`[call] RemoteAudio: play() FAIL for ${stream.id}`, err),
    );
  }, [stream]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.volume = volume;
  }, [volume]);

  return <audio ref={ref} autoPlay playsInline />;
}
