import { EmitterBase, type PlayerEngine } from './PlayerEngine';
import { extractYouTubeId } from '../../../utils/youtube';

// Минимальные типы YT IFrame API (без зависимости @types/youtube).
interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(sec: number, allowSeekAhead: boolean): void;
  mute(): void;
  unMute(): void;
  setVolume(v: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  setPlaybackRate(rate: number): void;
  getAvailablePlaybackRates(): number[];
  getIframe(): HTMLIFrameElement;
  destroy(): void;
}
interface YTNamespace {
  Player: new (el: HTMLElement, opts: unknown) => YTPlayer;
  PlayerState: { PLAYING: number; PAUSED: number; BUFFERING: number; ENDED: number };
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const REMOTE_GRACE_MS = 300;
const POLL_MS = 500;

let apiPromise: Promise<void> | null = null;
/** Загружает (один раз) YT IFrame API и резолвится, когда window.YT готов. */
function loadYTApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<void>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return apiPromise;
}

/**
 * Проигрывает YouTube через официальный IFrame Player API — запасной путь, когда
 * извлечение прямого потока не удалось (CORS/истечение/запрет). Реализует тот же
 * контракт PlayerEngine, что и нативные движки: VideoController и серверная
 * синхронизация работают с ним без изменений.
 *
 * Эхо-гвард: программные play/pause/seek от контроллера оборачиваются в
 * begin/endRemoteUpdate, и onStateChange не шлёт play/pause, пока «applying».
 */
export class YouTubeIframeEngine extends EmitterBase implements PlayerEngine {
  private player: YTPlayer | null = null;
  private container: HTMLDivElement | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private remoteDepth = 0;
  private remoteResetTimer: ReturnType<typeof setTimeout> | null = null;
  private duration = 0;
  private destroyed = false;
  private readonly prevVideoDisplay: string;

  constructor(private readonly video: HTMLVideoElement) {
    super();
    this.prevVideoDisplay = video.style.display;
  }

  async load(url: string): Promise<void> {
    const id = extractYouTubeId(url);
    if (!id) {
      this.emit('error', { kind: 'unsupported', message: 'Не удалось распознать YouTube-ссылку' });
      throw new Error('YouTubeIframeEngine: not a YouTube url');
    }
    await loadYTApi();
    if (this.destroyed) return;
    const YT = window.YT!;

    // Прячем нативный <video> и монтируем контейнер плеера поверх той же области.
    this.video.style.display = 'none';
    const parent = this.video.parentElement ?? document.body;
    const container = document.createElement('div');
    container.style.cssText =
      'position:absolute; inset:0; width:100%; height:100%; background:#000; z-index:0;';
    const inner = document.createElement('div');
    inner.style.cssText = 'width:100%; height:100%;';
    container.appendChild(inner);
    parent.appendChild(container);
    this.container = container;

    await new Promise<void>((resolve) => {
      this.player = new YT.Player(inner, {
        videoId: id,
        width: '100%',
        height: '100%',
        playerVars: {
          controls: 0,
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
          disablekb: 1,
          fs: 0,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            if (this.destroyed) return;
            this.duration = this.safeNum(() => this.player?.getDuration() ?? 0);
            // Наши контролы поверх — iframe не должен перехватывать клики.
            try {
              const iframe = this.player?.getIframe();
              if (iframe) iframe.style.pointerEvents = 'none';
            } catch {
              /* ignore */
            }
            this.startPolling();
            this.emit('ready');
            resolve();
          },
          onStateChange: (e: { data: number }) => this.onState(e.data),
          onError: (e: { data: number }) => {
            // 101/150 — владелец запретил встраивание; остальное — общая ошибка.
            if (e.data === 101 || e.data === 150) {
              this.emit('error', {
                kind: 'youtube_embedding_disabled',
                message: 'Владелец видео запретил встраивание',
              });
            } else {
              this.emit('error', { kind: 'load_failed', message: 'Ошибка YouTube-плеера' });
            }
          },
        },
      });
    });
  }

  private onState(state: number): void {
    const YT = window.YT;
    if (!YT) return;
    if (state === YT.PlayerState.BUFFERING) {
      this.emit('waiting');
      return;
    }
    if (state === YT.PlayerState.PLAYING) {
      this.duration = this.safeNum(() => this.player?.getDuration() ?? this.duration);
      this.emit('playing');
      if (!this.isApplyingRemote()) this.emit('play');
    } else if (state === YT.PlayerState.PAUSED) {
      if (!this.isApplyingRemote()) this.emit('pause');
    } else if (state === YT.PlayerState.ENDED) {
      this.emit('ended');
    }
  }

  private startPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      if (!this.player) return;
      this.emit('timeupdate', this.getCurrentTime());
    }, POLL_MS);
  }

  play(): Promise<void> {
    this.player?.playVideo();
    return Promise.resolve();
  }
  pause(): void {
    this.player?.pauseVideo();
  }
  seek(sec: number): void {
    this.player?.seekTo(Math.max(0, sec), true);
  }
  setVolume(volume: number, muted: boolean): void {
    if (!this.player) return;
    if (muted || volume <= 0) {
      this.player.mute();
    } else {
      this.player.unMute();
      this.player.setVolume(Math.round(Math.max(0, Math.min(1, volume)) * 100));
    }
  }
  getCurrentTime(): number {
    return this.safeNum(() => this.player?.getCurrentTime() ?? 0);
  }
  getDuration(): number {
    const d = this.safeNum(() => this.player?.getDuration() ?? this.duration);
    return Number.isFinite(d) ? d : 0;
  }
  isPaused(): boolean {
    const YT = window.YT;
    const s = this.player?.getPlayerState();
    if (s == null || !YT) return true;
    // playing/buffering трактуем как «не на паузе».
    return s !== YT.PlayerState.PLAYING && s !== YT.PlayerState.BUFFERING;
  }

  setPlaybackRate(rate: number): void {
    if (!this.player) return;
    // YouTube принимает только дискретные скорости — soft-коррекция 0.94/1.06
    // невозможна, выбираем ближайшую поддерживаемую (обычно сводится к 1).
    try {
      const avail = this.player.getAvailablePlaybackRates();
      if (!avail?.length) return;
      const closest = avail.reduce((a, b) => (Math.abs(b - rate) < Math.abs(a - rate) ? b : a), avail[0]);
      this.player.setPlaybackRate(closest);
    } catch {
      /* ignore */
    }
  }

  // ── Эхо-гвард (как в HtmlVideoEngine) ────────────────────────────────────
  beginRemoteUpdate(): void {
    this.remoteDepth += 1;
    if (this.remoteResetTimer) {
      clearTimeout(this.remoteResetTimer);
      this.remoteResetTimer = null;
    }
  }
  endRemoteUpdate(): void {
    this.remoteDepth = Math.max(0, this.remoteDepth - 1);
    if (this.remoteDepth > 0) return;
    if (this.remoteResetTimer) clearTimeout(this.remoteResetTimer);
    this.remoteResetTimer = setTimeout(() => {
      this.remoteResetTimer = null;
    }, REMOTE_GRACE_MS);
  }
  isApplyingRemote(): boolean {
    return this.remoteDepth > 0 || this.remoteResetTimer !== null;
  }

  getQualityLevels(): string[] {
    return [];
  }
  getCurrentQuality(): string {
    return 'auto';
  }
  setQuality(_level: string): void {
    /* управление качеством через API устарело и игнорируется YouTube */
  }

  destroy(): void {
    this.destroyed = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.remoteResetTimer) {
      clearTimeout(this.remoteResetTimer);
      this.remoteResetTimer = null;
    }
    try {
      this.player?.destroy();
    } catch {
      /* ignore */
    }
    this.player = null;
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    // Возвращаем нативный <video> в исходное состояние для следующего движка.
    this.video.style.display = this.prevVideoDisplay;
    this.clearListeners();
  }

  private safeNum(fn: () => number): number {
    try {
      const v = fn();
      return Number.isFinite(v) ? v : 0;
    } catch {
      return 0;
    }
  }
}
