import { useCallback, useEffect, useRef, useState } from 'react';
import { useVideoNotePlayerStore } from '../../../stores/videoNotePlayerStore';
import { formatDuration } from './RecordingTimer';

type Mode = 'preview' | 'full';

/** Окружность кольца прогресса в единицах viewBox (радиус 48 из 100). */
const RING_C = 2 * Math.PI * 48;

/**
 * CircularVideoPlayer — поведение видео-«кружка» как в Telegram (VideoPlaybackController):
 *  • ПРЕВЬЮ: пока виден (IntersectionObserver, без scroll-обработчиков) — беззвучный
 *    зацикленный автоплей без контролов; вне зоны — пауза.
 *  • ПОЛНОЕ: тап — звук С НАЧАЛА; повторный тап — пауза/продолжить; конец/крестик/
 *    другой кружок — возврат в превью. Со звуком играет только один (videoNotePlayerStore).
 * Заполняет 100% контейнера — РАЗМЕР задаёт бабл (ActiveVideoLayout), меняя реальную
 * высоту в ленте; сам плеер не масштабируется и не пересоздаёт `<video>` (прогресс цел).
 */
export function CircularVideoPlayer({
  messageId,
  url,
  thumbUrl,
  durationSec,
}: {
  messageId: string;
  url: string;
  thumbUrl?: string;
  durationSec: number;
}): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLButtonElement>(null);
  const [mode, setMode] = useState<Mode>('preview');
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [remainMs, setRemainMs] = useState(durationSec * 1000);
  const [paused, setPaused] = useState(false);
  const modeRef = useRef<Mode>('preview');
  const visibleRef = useRef(false);
  const currentId = useVideoNotePlayerStore((s) => s.currentId);
  const autoPlayId = useVideoNotePlayerStore((s) => s.autoPlayId);
  const setActive = useVideoNotePlayerStore((s) => s.setActive);
  const clearActive = useVideoNotePlayerStore((s) => s.clear);
  const playNext = useVideoNotePlayerStore((s) => s.playNext);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const revertToPreview = useCallback(() => {
    const v = videoRef.current;
    clearActive(messageId);
    setMode('preview');
    modeRef.current = 'preview';
    setProgress(0);
    setRemainMs(durationSec * 1000);
    if (v) {
      v.loop = true;
      v.muted = true;
      try {
        v.currentTime = 0;
      } catch {
        /* noop */
      }
      if (visibleRef.current) void v.play().catch(() => {});
      else v.pause();
    }
  }, [durationSec, clearActive, messageId]);

  // IntersectionObserver — превью только когда кружок реально виден (≥50%).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      visibleRef.current = true;
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries[0].isIntersecting && entries[0].intersectionRatio >= 0.5;
        visibleRef.current = vis;
        setVisible(vis);
      },
      { threshold: [0, 0.5, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Превью-воспроизведение по видимости (в full — рулит тап).
  useEffect(() => {
    const v = videoRef.current;
    if (!v || mode === 'full') return;
    if (visible) {
      v.muted = true;
      v.loop = true;
      void v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [visible, mode]);

  // Другой кружок запустился со звуком — возвращаем себя в превью.
  useEffect(() => {
    if (mode === 'full' && currentId !== messageId) revertToPreview();
  }, [currentId, messageId, mode, revertToPreview]);

  // Запуск полного режима: со звуком, с начала, регистрация как активного.
  const startFull = useCallback((): void => {
    const v = videoRef.current;
    if (!v) return;
    v.loop = false;
    v.muted = false;
    try {
      v.currentTime = 0;
    } catch {
      /* noop */
    }
    setActive(messageId, v, durationSec);
    setMode('full');
    modeRef.current = 'full';
    setProgress(0);
    void v.play().catch(() => {});
  }, [messageId, setActive, durationSec]);

  // Авто-next: предыдущий кружок закончился и «назначил» нас следующим — стартуем.
  useEffect(() => {
    if (autoPlayId === messageId && modeRef.current !== 'full') startFull();
  }, [autoPlayId, messageId, startFull]);

  const toggle = useCallback((): void => {
    const v = videoRef.current;
    if (!v) return;
    if (modeRef.current === 'preview') {
      startFull();
    } else {
      // Повторный тап по играющему — пауза; ещё раз — продолжить. Возврат в превью —
      // по крестику мини-плеера / окончании / запуску другого.
      if (v.paused) void v.play().catch(() => {});
      else v.pause();
    }
  }, [startFull]);

  const full = mode === 'full';

  return (
    <button
      ref={wrapRef}
      onClick={toggle}
      aria-label={full ? 'Пауза / продолжить' : 'Воспроизвести со звуком'}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        borderRadius: '50%',
        border: 'none',
        padding: 0,
        background: '#000',
        cursor: 'pointer',
        overflow: 'hidden',
        display: 'block',
      }}
    >
      <video
        ref={videoRef}
        src={url}
        poster={thumbUrl}
        muted
        loop
        playsInline
        preload="metadata"
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onTimeUpdate={(e) => {
          if (modeRef.current !== 'full') return;
          const v = e.currentTarget;
          const d = v.duration || durationSec || 1;
          setProgress(v.currentTime / d);
          setRemainMs(Math.max(0, (d - v.currentTime) * 1000));
        }}
        onEnded={() => {
          if (modeRef.current !== 'full') return;
          // Авто-next как у голосовых: следующий кружок стартует сам; если его нет —
          // возвращаемся в беззвучное превью.
          if (!playNext(messageId)) revertToPreview();
        }}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />

      {/* Кольцо прогресса — только в полном режиме; в единицах viewBox (масштабируется). */}
      {full && (
        <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)', pointerEvents: 'none' }}>
          <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.8" />
          <circle cx="50" cy="50" r="48" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - progress)} style={{ transition: 'stroke-dashoffset .12s linear' }} />
        </svg>
      )}

      {/* Полный режим на паузе — центральная иконка «продолжить». */}
      {full && paused && (
        <span
          aria-hidden
          style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 52, height: 52, borderRadius: 999, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)', display: 'grid', placeItems: 'center', pointerEvents: 'none' }}
        >
          <span style={{ width: 0, height: 0, marginLeft: 4, borderStyle: 'solid', borderWidth: '10px 0 10px 17px', borderColor: 'transparent transparent transparent #fff' }} />
        </span>
      )}

      {/* Превью: значок «без звука» (тап — включить звук). */}
      {!full && (
        <span
          aria-hidden
          style={{ position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 999, background: 'rgba(0,0,0,0.45)', display: 'grid', placeItems: 'center', pointerEvents: 'none' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff">
            <path d="M4 9v6h4l5 5V4L8 9H4z" />
            <path d="M16 8l6 8M22 8l-6 8" stroke="#fff" strokeWidth="2" fill="none" />
          </svg>
        </span>
      )}

      {/* Время — снизу: в полном режиме оставшееся, в превью общая длительность. */}
      <span
        style={{
          position: 'absolute',
          bottom: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 11,
          fontWeight: 600,
          color: '#fff',
          background: 'rgba(0,0,0,0.5)',
          padding: '2px 8px',
          borderRadius: 10,
          fontVariantNumeric: 'tabular-nums',
          pointerEvents: 'none',
        }}
      >
        {formatDuration(full ? remainMs : durationSec * 1000)}
      </span>
    </button>
  );
}
