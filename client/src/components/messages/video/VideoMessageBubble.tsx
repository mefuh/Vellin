import { useVideoNotePlayerStore } from '../../../stores/videoNotePlayerStore';
import type { ClientDm } from '../../../stores/dmStore';
import { CircularVideoPlayer } from './CircularVideoPlayer';

/** Обычный и увеличенный (во время воспроизведения) размеры кружка. */
const BASE = 200;
const BIG = 'min(272px, 72vw)';
/** Пружинистое, но не «прыгающее» изменение размера (лёгкий разгон + мягкая остановка). */
const SIZE_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const SIZE_MS = 360;

/** Крутящийся индикатор (загрузка/обработка) — на GPU через transform. */
function Ring({ progress }: { progress?: number }): React.ReactElement {
  const R = 20;
  const C = 2 * Math.PI * R;
  return (
    <svg width={52} height={52} viewBox="0 0 52 52" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx="26" cy="26" r={R} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
      <circle
        cx="26"
        cy="26"
        r={R}
        fill="none"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={progress != null ? C * (1 - progress) : C * 0.7}
        style={progress != null ? { transition: 'stroke-dashoffset .15s linear' } : { animation: 'dmSpin 0.9s linear infinite', transformOrigin: '26px 26px' }}
      />
    </svg>
  );
}

/**
 * VideoMessageBubble (+ ActiveVideoLayout): круглый бабл видеосообщения со всеми
 * состояниями (отправка → обработка → готово/ошибка). Во время воспроизведения
 * активного кружка меняется РЕАЛЬНЫЙ размер бокса (width/height, а не transform),
 * поэтому лента честно перестраивается — соседние сообщения плавно раздвигаются,
 * а по окончании возвращаются. Активность берётся из videoNotePlayerStore, размер
 * анимируется CSS-переходом (React не перерисовывается покадрово, `<video>` не
 * пересоздаётся — прогресс/состояние плеера сохраняются).
 */
export function VideoMessageBubble({
  m,
  clock,
  status,
}: {
  m: ClientDm;
  clock: string;
  status: React.ReactNode;
}): React.ReactElement {
  const ready = m.videoStatus === 'ready' && !!m.videoUrl && !m._uploading;
  const failed = m.videoStatus === 'failed' || m.failed;
  const active = useVideoNotePlayerStore((s) => s.currentId === m.id);
  const enlarged = active && ready;
  const boxSize = enlarged ? BIG : `${BASE}px`;

  const overlayLabel = m._uploading
    ? `Отправка${m._progress != null ? ` ${Math.round(m._progress * 100)}%` : '…'}`
    : failed
      ? 'Ошибка'
      : 'Обработка…';

  return (
    <div
      style={{
        position: 'relative',
        width: boxSize,
        height: boxSize,
        flexShrink: 0, // не даём flex-обёртке (maxWidth 76%) сжать увеличенный кружок
        // Меняем реальный размер бокса → лента перестраивается (не поверх, а в потоке).
        transition: `width ${SIZE_MS}ms ${SIZE_EASE}, height ${SIZE_MS}ms ${SIZE_EASE}`,
      }}
    >
      {ready ? (
        <CircularVideoPlayer messageId={m.id} url={m.videoUrl!} thumbUrl={m.videoThumbUrl} durationSec={m.videoDurationSec ?? 0} />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            background: m.videoThumbUrl ? `#000 center/cover url(${m.videoThumbUrl})` : '#141414',
            display: 'grid',
            placeItems: 'center',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'grid', placeItems: 'center', gap: 8, color: '#fff' }}>
            {failed ? (
              <span style={{ fontSize: 30, lineHeight: 1 }}>⚠️</span>
            ) : (
              <Ring progress={m._uploading ? m._progress ?? 0 : undefined} />
            )}
            <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.85)' }}>{overlayLabel}</span>
          </div>
        </div>
      )}

      {/* Время + статус доставки — пилюля снизу-справа поверх круга. */}
      <span
        style={{
          position: 'absolute',
          bottom: 6,
          right: 4,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 11,
          fontWeight: 600,
          color: '#fff',
          padding: '3px 8px',
          background: 'rgba(0,0,0,0.5)',
          borderRadius: 11,
        }}
      >
        {clock}
        {status}
      </span>
    </div>
  );
}
