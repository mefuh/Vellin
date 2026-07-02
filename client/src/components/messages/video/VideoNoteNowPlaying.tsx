import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../../shared';
import { ACCENT_GRAD } from '../chatTheme';
import { useVideoNotePlayerStore } from '../../../stores/videoNotePlayerStore';
import type { ClientDm } from '../../../stores/dmStore';

/**
 * Закреплённый мини-плеер «сейчас играет» для видео-«кружков» — тот же элемент,
 * что у голосовых (пауза, скорость, крестик + линия прогресса). Показывается,
 * пока в диалоге проигрывается кружок со звуком. Управление — общий
 * {@link useVideoNotePlayerStore} (регистрирует активный `<video>`).
 */
export function VideoNoteNowPlaying({
  messages,
  peerUsername,
  myId,
  topOffset = 0,
}: {
  messages: ClientDm[];
  peerUsername: string;
  myId: string;
  topOffset?: number;
}) {
  const currentId = useVideoNotePlayerStore((s) => s.currentId);
  const playing = useVideoNotePlayerStore((s) => s.playing);
  const posSec = useVideoNotePlayerStore((s) => s.positionSec);
  const durationSec = useVideoNotePlayerStore((s) => s.durationSec);
  const rate = useVideoNotePlayerStore((s) => s.rate);
  const toggleCurrent = useVideoNotePlayerStore((s) => s.toggleCurrent);
  const cycleRate = useVideoNotePlayerStore((s) => s.cycleRate);
  const stop = useVideoNotePlayerStore((s) => s.stop);

  const current = currentId ? messages.find((m) => m.id === currentId) : undefined;
  const active = !!current && !!current.videoUrl;

  const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const lastFrameRef = useRef<{ title: string; frac: number }>({ title: '', frac: 0 });

  useEffect(() => {
    if (active) {
      setMounted(true);
      return;
    }
    setOpen(false);
    const t = window.setTimeout(() => setMounted(false), reduceMotion ? 0 : 300);
    return () => window.clearTimeout(t);
  }, [active, reduceMotion]);

  useEffect(() => {
    if (mounted && active && !open) {
      const el = rootRef.current;
      if (el) void el.offsetHeight;
      setOpen(true);
    }
  }, [mounted, active, open]);

  const mine = current ? current.senderId === myId || current.senderId === 'me' : false;
  const title = current ? (mine ? 'Вы' : peerUsername) : lastFrameRef.current.title;
  const frac = active ? (durationSec > 0 ? Math.min(1, posSec / durationSec) : 0) : lastFrameRef.current.frac;
  if (active) lastFrameRef.current = { title, frac };

  if (!mounted) return null;

  return (
    <div
      ref={rootRef}
      style={{
        position: 'absolute',
        top: topOffset + 8,
        left: 0,
        right: 0,
        padding: '0 12px',
        zIndex: 6,
        pointerEvents: 'none',
        transform: open ? 'translateY(0)' : 'translateY(-10px)',
        opacity: open ? 1 : 0,
        transition: reduceMotion ? 'none' : 'transform .3s cubic-bezier(0.22, 1, 0.36, 1), opacity .26s ease',
      }}
    >
      <div
        className="dm-noselect"
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 54,
          padding: '0 8px 0 6px',
          borderRadius: 14,
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(var(--glass-blur))',
          WebkitBackdropFilter: 'blur(var(--glass-blur))',
          border: '1px solid var(--line-2)',
          overflow: 'hidden',
          pointerEvents: 'auto',
          boxShadow: 'var(--shadow-2)',
        }}
      >
        <button
          onClick={toggleCurrent}
          aria-label={playing ? 'Пауза' : 'Воспроизвести'}
          className="dm-press"
          style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 999, border: 'none', background: 'transparent', color: 'var(--text-0)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
        >
          <Icon name={playing ? 'pause' : 'play'} size={20} />
        </button>

        <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>Видеосообщение</div>
        </div>

        <button
          onClick={cycleRate}
          aria-label="Скорость воспроизведения"
          className="dm-press"
          style={{ flexShrink: 0, padding: '4px 9px', borderRadius: 8, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--text-1)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontVariantNumeric: 'tabular-nums' }}
        >
          {rate}X
        </button>
        <button
          onClick={stop}
          aria-label="Закрыть плеер"
          className="dm-press"
          style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 999, border: 'none', background: 'transparent', color: 'var(--text-2)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
        >
          <Icon name="close" size={18} />
        </button>

        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: ACCENT_GRAD, transformOrigin: 'left', transform: `scaleX(${frac})`, transition: 'transform .12s linear' }} />
      </div>
    </div>
  );
}
