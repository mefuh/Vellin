import { useEffect, useRef } from 'react';
import { useCallContext } from '../../hooks/CallContext';

/**
 * Renders an invisible `<audio>` per remote peer so call audio plays
 * regardless of which call UI is currently mounted (chat panel, fullscreen
 * overlay, or neither). Mount once at the Room.tsx level.
 */
export function RemoteAudioMixer() {
  const { remoteStreams } = useCallContext();
  return (
    <div aria-hidden style={{ display: 'none' }}>
      {[...remoteStreams.entries()].map(([userId, stream]) => (
        <RemoteAudio key={userId} stream={stream} />
      ))}
    </div>
  );
}

function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement | null>(null);
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
  return <audio ref={ref} autoPlay playsInline />;
}
