/**
 * Конвейер записи видео-«кружка» со сменой камеры без обрыва записи.
 *
 * Логика ВЫБОРА камеры отделена от логики ЗАПИСИ:
 *  • {@link MediaStreamManager} — владеет getUserMedia: постоянная аудио-дорожка
 *    (живёт всю сессию) + текущая видео-дорожка (пересоздаётся при смене камеры),
 *    корректно останавливает прошлую дорожку (без утечек и лишних MediaStream).
 *  • {@link CanvasRecordingSource} — офскрин-холст, в который непрерывно рисуется
 *    активная камера (центр-кроп в квадрат, фронт — зеркально). `captureStream`
 *    холста + постоянная аудио-дорожка идут в MediaRecorder. При смене камеры
 *    меняется лишь ИСТОЧНИК рисования — рекордер не перезапускается, таймер и звук
 *    не прерываются, получается ОДНО видеосообщение со всеми переключениями.
 *  • {@link RecordingPipeline} — связывает их и выбирает режим:
 *      – `canvas`  — бесшовная смена камеры (нужны 2+ камеры и canvas.captureStream);
 *                    ориентация финальна на клиенте (`mirrored=true`, сервер без hflip);
 *      – `direct`  — совместимый fallback: прямой поток фронталки, смена недоступна,
 *                    сервер зеркалит сам (`mirrored=false`).
 *
 * Каждая новая запись всегда начинается с фронтальной камеры (см. create()).
 */

export type Facing = 'user' | 'environment';

/** Квадрат холста записи (сервер отмасштабирует до своего размера). */
const CAPTURE_SIZE = 480;
/** Частота захвата холста. */
const CAPTURE_FPS = 30;

type CanvasWithCapture = HTMLCanvasElement & {
  captureStream?: (frameRate?: number) => MediaStream;
};

/**
 * Поддерживается ли бесшовная смена камеры: нужен `canvas.captureStream` и
 * MediaRecorder. На части старых браузеров (в т.ч. старый iOS) captureStream нет —
 * тогда работаем в direct-режиме без смены камеры.
 */
export function supportsSeamlessSwitch(): boolean {
  if (typeof document === 'undefined' || typeof MediaRecorder === 'undefined') return false;
  const c = document.createElement('canvas') as CanvasWithCapture;
  return typeof c.captureStream === 'function';
}

/** Число доступных камер (после выданного доступа лейблы/счёт достоверны). */
async function countCameras(): Promise<number> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'videoinput').length;
  } catch {
    return 0;
  }
}

/** Дождаться реальных кадров у `<video>` (или таймаут) — чтобы не поймать чёрный кадр. */
function waitForFrames(v: HTMLVideoElement, timeoutMs = 1500): Promise<void> {
  return new Promise((resolve) => {
    if (v.readyState >= 2 && v.videoWidth > 0) {
      resolve();
      return;
    }
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      v.removeEventListener('loadeddata', finish);
      v.removeEventListener('playing', finish);
      clearTimeout(t);
      resolve();
    };
    v.addEventListener('loadeddata', finish);
    v.addEventListener('playing', finish);
    const t = setTimeout(finish, timeoutMs);
  });
}

/** getUserMedia: аудио (постоянное) + видео по facingMode/deviceId (на смену камеры). */
class MediaStreamManager {
  private audioTrack: MediaStreamTrack | null = null;
  private videoTrack: MediaStreamTrack | null = null;

  async openAudio(): Promise<MediaStreamTrack> {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    const t = s.getAudioTracks()[0];
    if (!t) throw new Error('no_audio');
    this.audioTrack = t;
    return t;
  }

  private async getVideo(video: MediaTrackConstraints): Promise<MediaStreamTrack> {
    const s = await navigator.mediaDevices.getUserMedia({ video });
    const t = s.getVideoTracks()[0];
    if (!t) throw new Error('no_video');
    return t;
  }

  /**
   * Открыть видео по facingMode. `exact` заставляет драйвер реально сменить камеру
   * (иначе facingMode — «пожелание», и телефон может вернуть ту же фронталку —
   * тогда кажется, что кнопка лишь «раззеркалила» фронт вместо смены камеры).
   */
  openVideoByFacing(facing: Facing, exact = false): Promise<MediaStreamTrack> {
    const facingMode = exact ? ({ exact: facing } as ConstrainDOMString) : facing;
    return this.getVideo({ facingMode, width: { ideal: 640 }, height: { ideal: 640 } });
  }

  /** Открыть конкретную камеру по deviceId (гарантированно другое физ. устройство). */
  openVideoByDeviceId(deviceId: string): Promise<MediaStreamTrack> {
    return this.getVideo({ deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 640 } });
  }

  /** deviceId всех видеовходов (после доступа значения достоверны). */
  async listVideoInputIds(): Promise<string[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'videoinput').map((d) => d.deviceId).filter(Boolean);
  }

  /** Сделать дорожку активной; прошлую (если другая) — остановить (без утечек). */
  setActiveVideo(t: MediaStreamTrack): void {
    const prev = this.videoTrack;
    this.videoTrack = t;
    if (prev && prev !== t) prev.stop();
  }

  currentDeviceId(): string | undefined {
    return this.videoTrack?.getSettings().deviceId;
  }

  dispose(): void {
    this.audioTrack?.stop();
    this.videoTrack?.stop();
    this.audioTrack = null;
    this.videoTrack = null;
  }
}

/** Офскрин-холст: рисует активную камеру (кроп в квадрат, фронт — зеркально). */
class CanvasRecordingSource {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly stream: MediaStream;
  private activeVideo: HTMLVideoElement | null = null;
  private mirror = false;
  private raf = 0;
  private disposed = false;

  constructor(audioTrack: MediaStreamTrack) {
    const canvas = document.createElement('canvas') as CanvasWithCapture;
    canvas.width = CAPTURE_SIZE;
    canvas.height = CAPTURE_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no_canvas_ctx');
    this.ctx = ctx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CAPTURE_SIZE, CAPTURE_SIZE);
    const captured = canvas.captureStream!(CAPTURE_FPS);
    captured.addTrack(audioTrack);
    this.stream = captured;
    this.loop();
  }

  getStream(): MediaStream {
    return this.stream;
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.draw();
    this.raf = requestAnimationFrame(this.loop);
  };

  private draw(): void {
    const v = this.activeVideo;
    if (!v || v.readyState < 2) return; // держим прошлый кадр — без чёрного экрана
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    if (!vw || !vh) return;
    const side = Math.min(vw, vh);
    const sx = (vw - side) / 2;
    const sy = (vh - side) / 2;
    const ctx = this.ctx;
    ctx.save();
    if (this.mirror) {
      ctx.translate(CAPTURE_SIZE, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, sx, sy, side, side, 0, 0, CAPTURE_SIZE, CAPTURE_SIZE);
    ctx.restore();
  }

  /**
   * Плавно сменить источник рисования: пока новая камера не даст кадры, холст
   * продолжает рисовать прошлый кадр (нет чёрного экрана и мигания), затем атомарно
   * переключаемся и убираем прежний `<video>`.
   */
  async setSource(track: MediaStreamTrack, mirror: boolean): Promise<void> {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([track]);
    await video.play().catch(() => {});
    await waitForFrames(video);
    if (this.disposed) {
      video.srcObject = null;
      return;
    }
    const prev = this.activeVideo;
    this.activeVideo = video;
    this.mirror = mirror;
    if (prev) {
      prev.pause();
      prev.srcObject = null;
    }
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    if (this.activeVideo) {
      this.activeVideo.pause();
      this.activeVideo.srcObject = null;
      this.activeVideo = null;
    }
    this.stream.getVideoTracks().forEach((t) => t.stop());
  }
}

export class RecordingPipeline {
  mode: 'canvas' | 'direct' = 'direct';
  facing: Facing = 'user';
  /** true — ориентация задана клиентом (сервер не должен делать hflip). */
  mirrored = false;
  canSwitch = false;

  private manager = new MediaStreamManager();
  private source: CanvasRecordingSource | null = null;
  private directStream: MediaStream | null = null;
  private recordStream: MediaStream | null = null;
  private previewStream: MediaStream | null = null;
  private audioStream: MediaStream | null = null;

  /** Создать конвейер. ВСЕГДА стартует с фронтальной камеры. */
  static async create(): Promise<RecordingPipeline> {
    const p = new RecordingPipeline();
    const seamless = supportsSeamlessSwitch();

    // Доступ к камере+микрофону (фронталка). После этого enumerateDevices достоверен.
    const audio = await p.manager.openAudio();
    const video = await p.manager.openVideoByFacing('user');
    p.manager.setActiveVideo(video);
    p.facing = 'user';
    p.audioStream = new MediaStream([audio]);

    const cams = seamless ? await countCameras() : 0;
    if (seamless && cams >= 2) {
      const src = new CanvasRecordingSource(audio);
      await src.setSource(video, true); // фронт → зеркально
      p.source = src;
      p.recordStream = src.getStream();
      p.previewStream = new MediaStream([video]);
      p.mode = 'canvas';
      p.mirrored = true;
      p.canSwitch = true;
    } else {
      const direct = new MediaStream([video, audio]);
      p.directStream = direct;
      p.recordStream = direct;
      p.previewStream = new MediaStream([video]);
      p.mode = 'direct';
      p.mirrored = false;
      p.canSwitch = false;
    }
    return p;
  }

  getRecordStream(): MediaStream {
    return this.recordStream!;
  }
  getPreviewStream(): MediaStream {
    return this.previewStream!;
  }
  getAudioStream(): MediaStream {
    return this.audioStream!;
  }

  /**
   * Переключить фронт⇄зад БЕЗ обрыва записи, ГАРАНТИРУЯ реальную смену камеры (не
   * простое раззеркаливание фронта). Стратегия: (1) exact-facingMode заставляет
   * драйвер сменить камеру; (2) если он не поддержан или вернул то же устройство —
   * открываем другой deviceId явно. Ориентация (зеркалить ли) берётся из реального
   * facingMode новой дорожки. При неудаче (одна камера/нет доступа) — бросаем;
   * вызывающий ловит, запись продолжается на текущей (активные дорожки не трогаем
   * до успеха). Возвращает новый facing.
   */
  async switch(): Promise<Facing> {
    if (!this.canSwitch || !this.source) return this.facing;
    const target: Facing = this.facing === 'user' ? 'environment' : 'user';
    const currentId = this.manager.currentDeviceId();

    let track: MediaStreamTrack | null = null;
    try {
      track = await this.manager.openVideoByFacing(target, true);
    } catch {
      track = null; // exact не поддержан/камеры нет — уйдём в ветку по deviceId
    }
    // exact проигнорирован (та же камера) или не сработал → берём другой deviceId.
    if (!track || (currentId && track.getSettings().deviceId === currentId)) {
      if (track) track.stop();
      const ids = await this.manager.listVideoInputIds();
      const otherId = ids.find((id) => id !== currentId);
      if (!otherId) throw new Error('no_other_camera');
      track = await this.manager.openVideoByDeviceId(otherId);
    }

    // Зеркалим только фронт. Берём фактический facingMode дорожки, иначе целевой.
    const fm = track.getSettings().facingMode;
    const isFront = fm ? fm === 'user' : target === 'user';

    await this.source.setSource(track, isFront);
    this.manager.setActiveVideo(track); // остановит прошлую видео-дорожку
    this.facing = isFront ? 'user' : 'environment';
    this.previewStream = new MediaStream([track]);
    return this.facing;
  }

  dispose(): void {
    this.source?.dispose();
    this.directStream?.getTracks().forEach((t) => t.stop());
    this.manager.dispose();
    this.recordStream = null;
    this.previewStream = null;
    this.audioStream = null;
  }
}
