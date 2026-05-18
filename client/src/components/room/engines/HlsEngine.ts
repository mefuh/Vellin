import Hls, { type ErrorData, type Level } from 'hls.js';
import { HtmlVideoEngine } from './HtmlVideoEngine';

/**
 * HLS (m3u8) engine. In Safari we hand the URL to native <video> directly.
 * Everywhere else hls.js MSE-attaches and exposes its quality variants.
 *
 * Extends HtmlVideoEngine so all the play/pause/seek/timeupdate plumbing
 * (remoteDepth, event listeners) is reused — only `load`, quality APIs and
 * `destroy` change.
 */
export class HlsEngine extends HtmlVideoEngine {
  private hls: Hls | null = null;
  private currentLevel = -1; // -1 = auto in hls.js
  private levelsCache: Level[] = [];

  constructor(video: HTMLVideoElement) {
    super(video);
  }

  override async load(url: string): Promise<void> {
    this.teardownHls();
    const video = this.video;
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS (Safari, iOS) — reuse the base class flow.
      return super.load(url);
    }
    if (!Hls.isSupported()) {
      this.emit('error', {
        kind: 'unsupported',
        message: 'HLS не поддерживается этим браузером',
      });
      throw new Error('HLS unsupported');
    }
    const hls = new Hls({ enableWorker: true });
    this.hls = hls;
    this.beginRemoteUpdate();
    return new Promise<void>((resolve, reject) => {
      const onManifest = (): void => {
        hls.off(Hls.Events.MANIFEST_PARSED, onManifest);
        hls.off(Hls.Events.ERROR, onErr);
        this.levelsCache = hls.levels.slice();
        this.emitLevels();
        this.endRemoteUpdate();
        this.emit('ready');
        resolve();
      };
      const onErr = (_evt: unknown, data: ErrorData): void => {
        if (!data.fatal) return;
        hls.off(Hls.Events.MANIFEST_PARSED, onManifest);
        hls.off(Hls.Events.ERROR, onErr);
        this.endRemoteUpdate();
        this.emit('error', { kind: 'load_failed', message: `HLS: ${data.details ?? 'unknown'}` });
        reject(new Error(`HLS error: ${data.details}`));
      };
      hls.on(Hls.Events.MANIFEST_PARSED, onManifest);
      hls.on(Hls.Events.ERROR, onErr);
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
        const lvl = hls.levels[data.level];
        this.emit('qualitychange', lvl ? labelLevel(lvl) : 'auto');
      });
      hls.loadSource(url);
      hls.attachMedia(video);
    });
  }

  override getQualityLevels(): string[] {
    return ['auto', ...this.levelsCache.map(labelLevel)];
  }
  override getCurrentQuality(): string {
    if (!this.hls) return 'auto';
    if (this.hls.currentLevel < 0) return 'auto';
    const lvl = this.levelsCache[this.hls.currentLevel];
    return lvl ? labelLevel(lvl) : 'auto';
  }
  override setQuality(level: string): void {
    if (!this.hls) return;
    if (level === 'auto') {
      this.hls.currentLevel = -1;
      this.currentLevel = -1;
      return;
    }
    const idx = this.levelsCache.findIndex((l) => labelLevel(l) === level);
    if (idx >= 0) {
      this.hls.currentLevel = idx;
      this.currentLevel = idx;
    }
  }

  override destroy(): void {
    this.teardownHls();
    super.destroy();
  }

  private teardownHls(): void {
    if (this.hls) {
      try {
        this.hls.destroy();
      } catch {
        /* ignore */
      }
      this.hls = null;
    }
    this.levelsCache = [];
    this.currentLevel = -1;
  }

  private emitLevels(): void {
    this.emit('qualitylevels', this.getQualityLevels());
  }
}

function labelLevel(l: Level): string {
  if (l.height) return `${l.height}p`;
  if (l.bitrate) return `${Math.round(l.bitrate / 1000)}kbps`;
  return 'unknown';
}
