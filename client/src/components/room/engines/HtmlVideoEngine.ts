import { EmitterBase, type EngineError, type PlayerEngine } from './PlayerEngine';

const REMOTE_UPDATE_DEBOUNCE_MS = 80;

function isNotAllowed(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as { name?: unknown };
  return err.name === 'NotAllowedError';
}

export class HtmlVideoEngine extends EmitterBase implements PlayerEngine {
  private remoteDepth = 0;
  private remoteResetTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onPlay = (): void => {
    if (this.isApplyingRemote()) return;
    this.emit('play');
  };
  private readonly onPause = (): void => {
    if (this.isApplyingRemote()) return;
    this.emit('pause');
  };
  private readonly onSeeked = (): void => {
    if (this.isApplyingRemote()) return;
    this.emit('seeked');
  };
  private readonly onLoadedMetadata = (): void => {
    this.emit('ready');
  };
  private readonly onTimeUpdate = (): void => {
    this.emit('timeupdate', this.video.currentTime);
  };
  private readonly onEnded = (): void => {
    this.emit('ended');
  };
  // Native `waiting` / `playing` events drive the buffering spinner. We
  // simply forward them — the UI decides whether to add a debounce so quick
  // stalls don't make the spinner flicker.
  private readonly onWaitingMedia = (): void => {
    this.emit('waiting');
  };
  private readonly onPlayingMedia = (): void => {
    this.emit('playing');
  };
  private readonly onErrorEvent = (): void => {
    const code = this.video.error?.code;
    const map: Record<number, EngineError> = {
      1: { kind: 'load_failed', message: 'Загрузка отменена' },
      2: { kind: 'load_failed', message: 'Сетевая ошибка при загрузке видео' },
      3: { kind: 'load_failed', message: 'Ошибка декодирования видео' },
      4: { kind: 'unsupported', message: 'Формат не поддерживается, либо CORS блокирует поток' },
    };
    const err = code && map[code] ? map[code]! : { kind: 'internal' as const, message: 'Неизвестная ошибка плеера' };
    this.emit('error', err);
  };

  constructor(protected readonly video: HTMLVideoElement) {
    super();
    video.addEventListener('play', this.onPlay);
    video.addEventListener('pause', this.onPause);
    video.addEventListener('seeked', this.onSeeked);
    video.addEventListener('loadedmetadata', this.onLoadedMetadata);
    video.addEventListener('timeupdate', this.onTimeUpdate);
    video.addEventListener('ended', this.onEnded);
    video.addEventListener('waiting', this.onWaitingMedia);
    video.addEventListener('playing', this.onPlayingMedia);
    video.addEventListener('error', this.onErrorEvent);
    video.preload = 'auto';
    video.playsInline = true;
  }

  load(url: string): Promise<void> {
    this.beginRemoteUpdate();
    this.video.src = url;
    this.video.load();
    return new Promise<void>((resolve, reject) => {
      const onReady = (): void => {
        this.video.removeEventListener('loadedmetadata', onReady);
        this.video.removeEventListener('error', onErr);
        this.endRemoteUpdate();
        resolve();
      };
      const onErr = (): void => {
        this.video.removeEventListener('loadedmetadata', onReady);
        this.video.removeEventListener('error', onErr);
        this.endRemoteUpdate();
        reject(new Error('load failed'));
      };
      this.video.addEventListener('loadedmetadata', onReady);
      this.video.addEventListener('error', onErr);
    });
  }

  async play(): Promise<void> {
    try {
      await this.video.play();
      return;
    } catch (e) {
      // First try at unmuted playback failed — most browsers refuse to autoplay
      // audio until the user has interacted with the page. Retry muted: muted
      // autoplay is permitted nearly everywhere and lets the new joiner see
      // the video sync up. We surface 'autoplay_muted' so the UI can offer a
      // one-click "unmute" affordance.
      if (!isNotAllowed(e)) {
        this.emit('error', {
          kind: 'autoplay_blocked',
          message: 'Браузер заблокировал воспроизведение',
        });
        throw e;
      }
      const wasMuted = this.video.muted;
      this.video.muted = true;
      try {
        await this.video.play();
        if (!wasMuted) this.emit('autoplay_muted');
      } catch (e2) {
        // Even muted autoplay was rejected — give up and ask for a real click.
        this.video.muted = wasMuted;
        this.emit('error', {
          kind: 'autoplay_blocked',
          message: 'Браузер заблокировал автозапуск — нажмите Play',
        });
        throw e2;
      }
    }
  }
  pause(): void {
    this.video.pause();
  }
  seek(sec: number): void {
    this.video.currentTime = Math.max(0, sec);
  }
  setVolume(volume: number, muted: boolean): void {
    this.video.muted = muted;
    this.video.volume = Math.max(0, Math.min(1, volume));
  }
  getCurrentTime(): number {
    return this.video.currentTime;
  }
  getDuration(): number {
    return Number.isFinite(this.video.duration) ? this.video.duration : 0;
  }
  isPaused(): boolean {
    return this.video.paused;
  }

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
    // Once nesting fully unwinds, keep the "applying" flag true for a short
    // grace period to absorb echo events the media element fires asynchronously
    // (play → playing, seek → seeked) right after our programmatic mutation.
    if (this.remoteResetTimer) clearTimeout(this.remoteResetTimer);
    this.remoteResetTimer = setTimeout(() => {
      this.remoteResetTimer = null;
    }, REMOTE_UPDATE_DEBOUNCE_MS);
  }
  isApplyingRemote(): boolean {
    return this.remoteDepth > 0 || this.remoteResetTimer !== null;
  }
  setPlaybackRate(rate: number): void {
    this.video.playbackRate = rate;
  }

  getQualityLevels(): string[] {
    return [];
  }
  getCurrentQuality(): string {
    return 'auto';
  }
  setQuality(_level: string): void {
    /* HTML5 single-source streams have no quality variants — no-op */
  }

  destroy(): void {
    this.video.removeEventListener('play', this.onPlay);
    this.video.removeEventListener('pause', this.onPause);
    this.video.removeEventListener('seeked', this.onSeeked);
    this.video.removeEventListener('loadedmetadata', this.onLoadedMetadata);
    this.video.removeEventListener('timeupdate', this.onTimeUpdate);
    this.video.removeEventListener('ended', this.onEnded);
    this.video.removeEventListener('waiting', this.onWaitingMedia);
    this.video.removeEventListener('playing', this.onPlayingMedia);
    this.video.removeEventListener('error', this.onErrorEvent);
    if (this.remoteResetTimer) clearTimeout(this.remoteResetTimer);
    this.clearListeners();
  }
}
