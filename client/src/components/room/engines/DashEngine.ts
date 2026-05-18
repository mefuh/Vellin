import { HtmlVideoEngine } from './HtmlVideoEngine';

/**
 * MPEG-DASH engine. Uses shaka-player loaded lazily so it doesn't bloat the
 * initial bundle (shaka is ~280KB minified). Reuses HtmlVideoEngine for the
 * <video> element plumbing.
 */
export class DashEngine extends HtmlVideoEngine {
  // Typed as `unknown` to avoid coupling to shaka's complex type surface at
  // build time. Methods we call are guarded with runtime checks.
  private shakaPlayer: { load: (u: string) => Promise<void>; destroy: () => Promise<void>; getVariantTracks?: () => Array<{ id: number; height: number | null; bandwidth: number; active: boolean }>; selectVariantTrack?: (t: unknown, clear?: boolean) => void; configure?: (cfg: unknown) => void } | null = null;
  private variantCache: Array<{ id: number; label: string }> = [];

  override async load(url: string): Promise<void> {
    this.teardown();
    const mod = await import('shaka-player/dist/shaka-player.compiled.js');
    const shaka = (mod as { default?: unknown } & Record<string, unknown>).default ?? mod;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const PlayerCtor = (shaka as any).Player as new (videoEl: HTMLVideoElement) => typeof this.shakaPlayer extends infer T ? NonNullable<T> : never;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const installAll = (shaka as any).polyfill?.installAll;
    if (typeof installAll === 'function') installAll();

    this.beginRemoteUpdate();
    try {
      const player = new PlayerCtor(this.video);
      this.shakaPlayer = player as NonNullable<typeof this.shakaPlayer>;
      await this.shakaPlayer.load(url);
      this.refreshVariants();
      this.emit('ready');
    } catch (err) {
      this.emit('error', { kind: 'load_failed', message: `DASH: ${(err as Error).message}` });
      throw err;
    } finally {
      this.endRemoteUpdate();
    }
  }

  override getQualityLevels(): string[] {
    return ['auto', ...this.variantCache.map((v) => v.label)];
  }
  override getCurrentQuality(): string {
    if (!this.shakaPlayer?.getVariantTracks) return 'auto';
    const tracks = this.shakaPlayer.getVariantTracks();
    const active = tracks.find((t) => t.active);
    if (!active) return 'auto';
    const entry = this.variantCache.find((v) => v.id === active.id);
    return entry?.label ?? 'auto';
  }
  override setQuality(level: string): void {
    if (!this.shakaPlayer?.selectVariantTrack || !this.shakaPlayer.configure) return;
    if (level === 'auto') {
      this.shakaPlayer.configure({ abr: { enabled: true } });
      return;
    }
    const entry = this.variantCache.find((v) => v.label === level);
    if (!entry) return;
    const tracks = this.shakaPlayer.getVariantTracks?.() ?? [];
    const track = tracks.find((t) => t.id === entry.id);
    if (!track) return;
    this.shakaPlayer.configure({ abr: { enabled: false } });
    this.shakaPlayer.selectVariantTrack(track, true);
    this.emit('qualitychange', level);
  }

  override destroy(): void {
    this.teardown();
    super.destroy();
  }

  private refreshVariants(): void {
    const tracks = this.shakaPlayer?.getVariantTracks?.() ?? [];
    const dedup = new Map<number, { id: number; label: string }>();
    for (const t of tracks) {
      const label = t.height ? `${t.height}p` : `${Math.round(t.bandwidth / 1000)}kbps`;
      dedup.set(t.id, { id: t.id, label });
    }
    this.variantCache = [...dedup.values()];
    this.emit('qualitylevels', this.getQualityLevels());
  }

  private teardown(): void {
    if (this.shakaPlayer) {
      try {
        void this.shakaPlayer.destroy();
      } catch {
        /* ignore */
      }
      this.shakaPlayer = null;
    }
    this.variantCache = [];
  }
}
