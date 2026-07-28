import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import jsQR from 'jsqr';
import { Button } from '../../shared';
import { profileApi } from '../../api/profile';
import { ApiHttpError } from '../../api/client';

/** Достаёт идентификатор заявки из того, что зашито в QR (ссылка /link/<id>). */
function parseRequestId(raw: string): string | null {
  const value = raw.trim();
  const match = value.match(/\/link\/([A-Za-z0-9_-]+)/);
  if (match) return match[1];
  // Кто-то мог отсканировать «голый» идентификатор — принимаем и его.
  return /^[A-Za-z0-9_-]{10,}$/.test(value) ? value : null;
}

/**
 * Сканер QR-кода для входа десктоп-клиента: снимает камерой код с экрана
 * компьютера и подтверждает заявку. Открывается из раздела «Устройства».
 */
export function QrScannerModal({ onClose, onApproved }: { onClose: () => void; onApproved: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const doneRef = useRef(false);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'sending' | 'done'>('starting');
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const approve = useCallback(
    async (requestId: string) => {
      if (doneRef.current) return;
      doneRef.current = true;
      setStatus('sending');
      stop();
      try {
        await profileApi.approveQrLogin(requestId);
        setStatus('done');
        onApproved();
      } catch (e) {
        setError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось подтвердить вход');
        setStatus('scanning');
      }
    },
    [onApproved, stop],
  );

  // Пока сканер открыт, страница под ним не должна прокручиваться.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    let cancelled = false;

    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!cancelled && video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h);
          const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h);
          const id = code ? parseRequestId(code.data) : null;
          if (id) {
            void approve(id);
            return;
          }
        }
      }
      if (!cancelled) raf = requestAnimationFrame(tick);
    };

    (async () => {
      try {
        // Тыловая камера — код снимают с экрана компьютера.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus('scanning');
        raf = requestAnimationFrame(tick);
      } catch {
        setError('Нет доступа к камере. Разрешите доступ в браузере и попробуйте снова.');
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stop();
    };
  }, [approve, stop]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2100,
        background: 'rgba(0,0,0,.72)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 380,
          padding: 20,
          borderRadius: 'var(--r-xl)',
          background: 'var(--bg-1)',
          border: '1px solid var(--line-1)',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-0)' }}>
          Добавить устройство
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
          Наведите камеру на QR-код в окне входа приложения Vellin на компьютере.
        </p>

        <div
          style={{
            position: 'relative',
            aspectRatio: '1',
            borderRadius: 'var(--r-lg)',
            overflow: 'hidden',
            background: 'var(--bg-2)',
            border: '1px solid var(--line-1)',
          }}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          {status !== 'scanning' && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                fontSize: 13,
                color: 'var(--text-2)',
                background: 'var(--bg-2)',
              }}
            >
              {status === 'starting' && 'Включаем камеру…'}
              {status === 'sending' && 'Подтверждаем вход…'}
              {status === 'done' && 'Готово — приложение войдёт в аккаунт'}
            </div>
          )}
        </div>

        {error && <div style={{ fontSize: 13, color: 'var(--accent-hi)' }}>{error}</div>}

        <Button variant="ghost" onClick={onClose} style={{ width: '100%' }}>
          {status === 'done' ? 'Закрыть' : 'Отмена'}
        </Button>
      </div>
    </div>,
    document.body,
  );
}
