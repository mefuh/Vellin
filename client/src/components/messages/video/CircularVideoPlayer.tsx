import { useCallback, useEffect, useRef, useState } from 'react';
import { useVideoNotePlayerStore } from '../../../stores/videoNotePlayerStore';
import { useVideoPreviewStore } from '../../../stores/videoPreviewStore';
import { formatDuration } from './RecordingTimer';

/** Окружность кольца прогресса в единицах viewBox (радиус 48 из 100). */
const RING_C = 2 * Math.PI * 48;

/**
 * CircularVideoPlayer — видео-«кружок» как в Telegram, но с жёстким контролем
 * числа живых `<video>` в DOM (критично для iOS).
 *
 * КЛЮЧЕВОЕ: `<video>` монтируется только для кружков, реально ВИДИМЫХ во вьюпорте
 * (их на экране единицы), а не для всего треда. Кружки вне кадра — статичный
 * постер `<img>` без видео-элемента. Раньше КАЖДЫЙ кружок треда держал живой
 * `<video src preload=metadata>` — на iOS это десятки декод/композитных слоёв,
 * которые WebKit переcomposeит на любой перерисовке (старт голосового рядом,
 * переход, rAF-прогресс) → затор кадра 200-600мс. Плюс беззвучный превью-автоплей
 * оставлен только у ОДНОГО самого видимого кружка (videoPreviewStore).
 *
 * iOS-нюанс: `<video>` со звуком стартует только СИНХРОННО в обработчике жеста —
 * поэтому запуск по тапу делаем прямо в onClick (видео для видимого кружка уже
 * смонтировано), а не в эффекте. Эффект запускает лишь авто-next цепочки (там
 * жеста нет, но воспроизведение продолжает начатую пользователем сессию).
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
  const [full, setFull] = useState(false);
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [remainMs, setRemainMs] = useState(durationSec * 1000);
  const [paused, setPaused] = useState(false);
  const fullRef = useRef(false);
  const startedRef = useRef(false); // full-воспроизведение уже запущено (дедуп)
  const currentId = useVideoNotePlayerStore((s) => s.currentId);
  const setActive = useVideoNotePlayerStore((s) => s.setActive);
  const clearActive = useVideoNotePlayerStore((s) => s.clear);
  const playNext = useVideoNotePlayerStore((s) => s.playNext);
  const reportPreview = useVideoPreviewStore((s) => s.report);
  const clearPreview = useVideoPreviewStore((s) => s.clear);
  // Единственный самый видимый кружок среди видимых — только ему разрешён
  // беззвучный превью-автоплей (см. videoPreviewStore).
  const isPreviewTurn = useVideoPreviewStore((s) => s.activeId === messageId);

  useEffect(() => {
    fullRef.current = full;
  }, [full]);

  // Живой `<video>` — для любого видимого кружка (нужен, чтобы тап мог стартовать
  // воспроизведение синхронно в жесте, и чтобы авто-next-цель существовала).
  // Беззвучный превью-автоплей — только у одного (previewPlaying).
  const showVideo = full || visible;
  const previewPlaying = isPreviewTurn && !currentId && visible;

  // IntersectionObserver: держим `visible` + репортим долю видимости координатору
  // превью (чтобы выбрать единственный автоплеящийся кружок).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      reportPreview(messageId, 1);
      return () => clearPreview(messageId);
    }
    const io = new IntersectionObserver(
      (entries) => {
        const ratio = entries[0].isIntersecting ? entries[0].intersectionRatio : 0;
        const vis = ratio >= 0.5;
        setVisible(vis);
        reportPreview(messageId, vis ? ratio : 0);
      },
      { threshold: [0, 0.5, 1] },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearPreview(messageId);
    };
  }, [messageId, reportPreview, clearPreview]);

  // Настроить и запустить `<video>` в полном режиме (звук, с начала, регистрация
  // активным). Вызывается ЛИБО из onClick (в жесте — iOS разрешает звук), ЛИБО из
  // эффекта авто-next. Идемпотентно за счёт startedRef.
  const beginFull = useCallback(
    (v: HTMLVideoElement) => {
      if (startedRef.current) return;
      startedRef.current = true;
      v.loop = false;
      v.muted = false;
      try {
        v.currentTime = 0;
      } catch {
        /* noop */
      }
      setActive(messageId, v, durationSec);
      setProgress(0);
      void v.play().catch(() => {});
    },
    [messageId, setActive, durationSec],
  );

  // Беззвучный превью-автоплей: видео смонтировано и сейчас его очередь — muted
  // loop; во всех прочих случаях смонтированное превью-видео держим на ПАУЗЕ,
  // чтобы видимые, но неактивные кружки не декодировались зря (иначе во время
  // чужого воспроизведения снова много живых декодеров — возврат к джанку).
  useEffect(() => {
    if (full) return;
    const v = videoRef.current;
    if (!v) return;
    if (previewPlaying) {
      v.muted = true;
      v.loop = true;
      void v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [previewPlaying, full]);

  // Другой кружок/медиа запустился (currentId сменился на чужой) — выходим из
  // полного режима в превью. Слушатели нашего `<video>` уже сняты чужим setActive.
  useEffect(() => {
    if (full && currentId !== messageId) {
      setFull(false);
      fullRef.current = false;
      startedRef.current = false;
      setProgress(0);
      setRemainMs(durationSec * 1000);
    }
  }, [currentId, messageId, full, durationSec]);

  const revertToPreview = useCallback(() => {
    clearActive(messageId);
    setFull(false);
    fullRef.current = false;
    startedRef.current = false;
    setProgress(0);
    setRemainMs(durationSec * 1000);
  }, [durationSec, clearActive, messageId]);

  const toggle = useCallback((): void => {
    const v = videoRef.current;
    if (!fullRef.current) {
      // Вход в полный режим. Видео для видимого кружка уже смонтировано —
      // запускаем ПРЯМО СЕЙЧАС, в жесте (иначе iOS блокирует звук).
      setFull(true);
      fullRef.current = true;
      if (v) beginFull(v);
      return;
    }
    if (!v) return;
    // Повторный тап по играющему — пауза; ещё раз — продолжить.
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  }, [beginFull]);

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
        background: thumbUrl ? `#000 center/cover url(${thumbUrl})` : '#000',
        cursor: 'pointer',
        overflow: 'hidden',
        display: 'block',
      }}
    >
      {showVideo ? (
        <video
          ref={videoRef}
          src={url}
          poster={thumbUrl}
          muted
          loop
          playsInline
          preload="none"
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
          onTimeUpdate={(e) => {
            if (!fullRef.current) return;
            const v = e.currentTarget;
            const d = v.duration || durationSec || 1;
            setProgress(v.currentTime / d);
            setRemainMs(Math.max(0, (d - v.currentTime) * 1000));
          }}
          onEnded={() => {
            if (!fullRef.current) return;
            // Авто-next: следующее медиа стартует само; если его нет — в превью.
            if (!playNext(messageId)) revertToPreview();
          }}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        // Вне кадра — статичный постер БЕЗ видео-элемента (экономим декодеры iOS).
        <img
          src={thumbUrl}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      )}

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
          style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 52, height: 52, borderRadius: 999, background: 'rgba(0,0,0,0.45)', display: 'grid', placeItems: 'center', pointerEvents: 'none' }}
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
