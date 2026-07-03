import { useCallback, useEffect, useRef, useState } from 'react';
import { RecordingPipeline, type Facing } from '../components/messages/video/recordingPipeline';

export interface VideoRecordResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  /** Ориентация уже финальна (canvas-конвейер) — сервер не должен зеркалить. */
  mirrored: boolean;
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
 * useVideoRecorder — оркестратор записи видео-«кружков». Логика ВЫБОРА камеры
 * инкапсулирована в {@link RecordingPipeline} (получение потоков, canvas-конвейер,
 * бесшовная смена фронт⇄зад), здесь — состояние записи и MediaRecorder.
 * `start()` ВСЕГДА начинает с фронтальной камеры; отдаёт live-`stream` для превью,
 * `facing`/`canSwitch`/`switching` для кнопки смены, `switchCamera()` для переключения.
 * `stop()`/`cancel()` завершают и резолвят blob (+флаг mirrored) / null.
 */
export function useVideoRecorder() {
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<CameraPermission>('idle');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facing, setFacing] = useState<Facing>('user');
  const [canSwitch, setCanSwitch] = useState(false);
  const [switching, setSwitching] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const pipelineRef = useRef<RecordingPipeline | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  const switchingRef = useRef(false);
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
    pipelineRef.current?.dispose();
    pipelineRef.current = null;
    recorderRef.current = null;
    switchingRef.current = false;
    setStream(null);
    setSwitching(false);
    setCanSwitch(false);
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

  const start = useCallback(async (): Promise<boolean> => {
    setError(null);
    if (recorderRef.current && recorderRef.current.state === 'recording') return true;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setPermission('unsupported');
      setError('Запись видео не поддерживается в этом браузере');
      return false;
    }
    try {
      const pipeline = await RecordingPipeline.create();
      pipelineRef.current = pipeline;
      setPermission('granted');
      setFacing(pipeline.facing);
      setCanSwitch(pipeline.canSwitch);
      setStream(pipeline.getPreviewStream());

      // Анализатор уровня звука (для живой волны). Не критичен — при сбое молча
      // пропускаем, запись продолжается.
      try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) {
          const ctx = new Ctx();
          const src = ctx.createMediaStreamSource(pipeline.getAudioStream());
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
      const mr = new MediaRecorder(pipeline.getRecordStream(), mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      cancelledRef.current = false;
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const durationMs = Date.now() - startTsRef.current;
        const type = mr.mimeType || mimeType || 'video/webm';
        const blob = new Blob(chunksRef.current, { type });
        const mirrored = pipelineRef.current?.mirrored ?? false;
        const result: VideoRecordResult | null =
          cancelledRef.current || blob.size === 0 ? null : { blob, mimeType: type, durationMs, mirrored };
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
  }, [cleanup]);

  /**
   * Сменить камеру фронт⇄зад БЕЗ обрыва записи. Смена камеры отделена от записи:
   * рекордер не трогаем — при неудаче (одна камера/нет доступа) остаёмся на текущей
   * и показываем короткое сообщение, запись продолжается.
   */
  const switchCamera = useCallback(async (): Promise<void> => {
    const pipeline = pipelineRef.current;
    if (!pipeline || !pipeline.canSwitch || switchingRef.current) return;
    switchingRef.current = true;
    setSwitching(true);
    try {
      const next = await pipeline.switch();
      setFacing(next);
      setStream(pipeline.getPreviewStream());
    } catch {
      setError('Не удалось переключить камеру');
      window.setTimeout(() => setError(null), 2200);
    } finally {
      switchingRef.current = false;
      setSwitching(false);
    }
  }, []);

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

  return {
    recording,
    elapsedMs,
    error,
    setError,
    permission,
    stream,
    facing,
    canSwitch,
    switching,
    switchCamera,
    start,
    stop,
    cancel,
    getLevel,
  };
}
