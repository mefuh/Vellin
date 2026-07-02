import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * RecordingOverlay + CameraPreview для видео-«кружков»: весь чат уходит в сильный
 * blur (и перестаёт быть кликабельным), по центру — большой круг с фронт-камерой.
 * Только визуальная часть: элементы управления (полоса записи + кнопки) рисует
 * композер поверх этого оверлея тем же UI, что у голосовых. Картинку НЕ зеркалим —
 * превью совпадает с тем, что уходит в отправленном кружке.
 */
export function VideoRecordOverlay({
  stream,
  cancelArmed,
  visible,
}: {
  stream: MediaStream | null;
  cancelArmed: boolean;
  visible: boolean;
}): React.ReactElement {
  const liveRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = liveRef.current;
    if (v && stream && v.srcObject !== stream) {
      v.srcObject = stream;
      void v.play().catch(() => {});
    }
  }, [stream]);

  const circle = 'min(72vw, 300px)';
  const ringColor = cancelArmed ? 'rgba(255,59,48,0.95)' : 'rgba(255,255,255,0.92)';

  return createPortal(
    <div
      aria-hidden={!visible}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(10,8,7,0.4)',
        backdropFilter: 'blur(28px) saturate(1.1)',
        WebkitBackdropFilter: 'blur(28px) saturate(1.1)',
        opacity: visible ? 1 : 0,
        transition: 'opacity .22s ease',
        // Перекрываем чат: во время записи он не должен быть кликабельным. Жест
        // ведут window-слушатели кнопки композера — auto его не ломает.
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 'calc(env(safe-area-inset-top, 0px) + 13vh)',
          transform: visible ? 'translateX(-50%) scale(1)' : 'translateX(-50%) scale(0.82)',
          width: circle,
          height: circle,
          borderRadius: '50%',
          overflow: 'hidden',
          boxShadow: `0 0 0 4px ${ringColor}, 0 20px 60px rgba(0,0,0,0.5)`,
          transition: 'transform .34s cubic-bezier(.34,1.56,.64,1), box-shadow .2s ease',
          background: '#000',
        }}
      >
        <video
          ref={liveRef}
          muted
          autoPlay
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: cancelArmed ? 0.4 : 1, transition: 'opacity .18s ease' }}
        />
      </div>
    </div>,
    document.body,
  );
}
