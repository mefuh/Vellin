import { useCallback, useEffect, useRef, useState } from 'react';

/** Результат записи голосового. */
export interface RecordResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

/** Подобрать поддерживаемый браузером контейнер записи. */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return undefined;
}

/**
 * Запись голосового через MediaRecorder. `start()` запрашивает доступ к
 * микрофону и начинает запись; `stop()` завершает и резолвит blob; `cancel()`
 * завершает и отбрасывает (резолвит null). Поток микрофона глушится в любом
 * исходе. Длительность измеряется по таймеру (метаданные webm/opus часто врут).
 */
export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  const resolveRef = useRef<((r: RecordResult | null) => void) | null>(null);
  // Анализатор для живой волны во время записи (амплитуда микрофона в реальном
  // времени). Не подключаем к destination — только читаем уровень.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelBufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    analyserRef.current = null;
    levelBufRef.current = null;
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  /** Текущий уровень микрофона 0..1 (RMS, поджатый для речи). 0 — нет записи. */
  const getLevel = useCallback((): number => {
    const a = analyserRef.current;
    if (!a) return 0;
    const buf = levelBufRef.current ?? (levelBufRef.current = new Uint8Array(a.fftSize));
    a.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length); // 0..1, у речи обычно мало
    return Math.max(0, Math.min(1, rms * 3.4));
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    setError(null);
    // Уже идёт запись — не пересоздаём рекордер (иначе сброс отсчёта = «слишком
    // короткая» при отправке).
    if (recorderRef.current && recorderRef.current.state === 'recording') return true;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Запись не поддерживается в этом браузере');
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // Живая волна: ответвляем поток в AnalyserNode (без вывода на динамики).
      try {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AC) {
          const ctx = new AC();
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          audioCtxRef.current = ctx;
          analyserRef.current = analyser;
          levelBufRef.current = new Uint8Array(analyser.fftSize);
        }
      } catch {
        /* анализатор опционален — без него просто не будет живой волны */
      }
      const mimeType = pickMimeType();
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      cancelledRef.current = false;
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const durationMs = Date.now() - startTsRef.current;
        const type = mr.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        const result: RecordResult | null =
          cancelledRef.current || blob.size === 0 ? null : { blob, mimeType: type, durationMs };
        cleanup();
        setRecording(false);
        setElapsedMs(0);
        resolveRef.current?.(result);
        resolveRef.current = null;
      };
      recorderRef.current = mr;
      startTsRef.current = Date.now();
      mr.start();
      setRecording(true);
      setElapsedMs(0);
      timerRef.current = setInterval(() => setElapsedMs(Date.now() - startTsRef.current), 100);
      return true;
    } catch {
      cleanup();
      setRecording(false);
      setError('Нет доступа к микрофону');
      return false;
    }
  }, [cleanup]);

  const finish = useCallback((cancel: boolean): Promise<RecordResult | null> => {
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

  // Размонтирование во время записи — отбросить и заглушить микрофон.
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

  return { recording, elapsedMs, error, setError, start, stop, cancel, getLevel };
}
