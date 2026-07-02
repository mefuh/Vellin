import { useCallback, useEffect, useRef, useState } from 'react';

export interface VideoRecordResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

export type CameraPermission = 'idle' | 'granted' | 'denied' | 'unsupported';

/**
 * Подбор контейнера записи видео. mp4 предпочтителен (Safari/iOS пишет его —
 * играет везде); Chrome/Android обычно отдают webm (vp9/vp8 + opus) — их
 * сервер транскодирует в mp4.
 */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=h264,opus',
    'video/webm',
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return undefined;
}

/**
 * useVideoRecorder — CameraPermissionManager + RecordingStateManager для
 * видео-«кружков». `start(facingMode)` запрашивает камеру+микрофон и начинает
 * запись, отдаёт live-`stream` для превью; `stop()`/`cancel()` завершают и
 * резолвят blob / null. Длительность — по таймеру (метаданные webm часто врут).
 * facingMode параметризован (задел на заднюю камеру без переписывания).
 */
export function useVideoRecorder() {
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<CameraPermission>('idle');
  const [stream, setStream] = useState<MediaStream | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  const resolveRef = useRef<((r: VideoRecordResult | null) => void) | null>(null);
  // Аудио-анализатор для «живой» волны в полосе записи (как у голосовых).
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioBufRef = useRef<Uint8Array | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    analyserRef.current = null;
    audioBufRef.current = null;
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setStream(null);
  }, []);

  /** Текущий уровень звука 0..1 (RMS) — для отрисовки живой волны записи. */
  const getLevel = useCallback((): number => {
    const analyser = analyserRef.current;
    const buf = audioBufRef.current;
    if (!analyser || !buf) return 0;
    analyser.getByteTimeDomainData(buf as Parameters<typeof analyser.getByteTimeDomainData>[0]);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / buf.length) * 3.2);
  }, []);

  const start = useCallback(
    async (facingMode: 'user' | 'environment' = 'user'): Promise<boolean> => {
      setError(null);
      if (recorderRef.current && recorderRef.current.state === 'recording') return true;
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        setPermission('unsupported');
        setError('Запись видео не поддерживается в этом браузере');
        return false;
      }
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 640 }, height: { ideal: 640 } },
          audio: true,
        });
        streamRef.current = mediaStream;
        setStream(mediaStream);
        setPermission('granted');

        // Анализатор уровня звука (для живой волны). Не критичен — при сбое молча
        // пропускаем, запись продолжается.
        try {
          const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (Ctx) {
            const ctx = new Ctx();
            const src = ctx.createMediaStreamSource(mediaStream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            src.connect(analyser);
            audioCtxRef.current = ctx;
            analyserRef.current = analyser;
            audioBufRef.current = new Uint8Array(analyser.fftSize);
          }
        } catch {
          /* волна не критична */
        }

        const mimeType = pickMimeType();
        const mr = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined);
        chunksRef.current = [];
        cancelledRef.current = false;
        mr.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
        };
        mr.onstop = () => {
          const durationMs = Date.now() - startTsRef.current;
          const type = mr.mimeType || mimeType || 'video/webm';
          const blob = new Blob(chunksRef.current, { type });
          const result: VideoRecordResult | null =
            cancelledRef.current || blob.size === 0 ? null : { blob, mimeType: type, durationMs };
          cleanup();
          setRecording(false);
          setElapsedMs(0);
          resolveRef.current?.(result);
          resolveRef.current = null;
        };
        recorderRef.current = mr;
        startTsRef.current = Date.now();
        // timeslice=1000: чанки набегают периодически (мягче по памяти; задел
        // под потоковый аплоад в Фазе 2 — там чанки уйдут по мере записи).
        mr.start(1000);
        setRecording(true);
        setElapsedMs(0);
        timerRef.current = setInterval(() => setElapsedMs(Date.now() - startTsRef.current), 100);
        return true;
      } catch (err) {
        cleanup();
        setRecording(false);
        const name = (err as { name?: string }).name;
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setPermission('denied');
          setError('Нет доступа к камере');
        } else {
          setError('Не удалось начать запись');
        }
        return false;
      }
    },
    [cleanup],
  );

  const finish = useCallback((cancel: boolean): Promise<VideoRecordResult | null> => {
    return new Promise((resolve) => {
      const mr = recorderRef.current;
      if (!mr || mr.state === 'inactive') {
        resolve(null);
        return;
      }
      cancelledRef.current = cancel;
      resolveRef.current = resolve;
      mr.stop();
    });
  }, []);

  const stop = useCallback(() => finish(false), [finish]);
  const cancel = useCallback(() => finish(true), [finish]);

  useEffect(() => {
    return () => {
      const mr = recorderRef.current;
      if (mr && mr.state !== 'inactive') {
        cancelledRef.current = true;
        try {
          mr.stop();
        } catch {
          /* noop */
        }
      }
      cleanup();
    };
  }, [cleanup]);

  return { recording, elapsedMs, error, setError, permission, stream, start, stop, cancel, getLevel };
}
