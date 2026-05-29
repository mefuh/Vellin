export type EngineError =
  | { kind: 'load_failed'; message: string }
  | { kind: 'unsupported'; message: string }
  | { kind: 'autoplay_blocked'; message: string }
  | { kind: 'youtube_embedding_disabled'; message: string }
  | { kind: 'internal'; message: string };

export interface EngineEventMap {
  play: void;
  pause: void;
  seeked: void;
  ready: void;
  ended: void;
  error: EngineError;
  timeupdate: number;
  qualitychange: string;
  qualitylevels: string[];
  /** Emitted when play() succeeded only after the engine fell back to muted
   * autoplay (browser autoplay policy). UI should surface an "unmute" affordance. */
  autoplay_muted: void;
  /** Playback stalled mid-stream waiting for more data. UI should show a
   *  buffering spinner. Pairs with `playing` on resume. */
  waiting: void;
  /** Playback resumed after a stall (or started for the first time). UI
   *  should hide any buffering spinner. */
  playing: void;
}

export type EngineEventName = keyof EngineEventMap;

type Listener<K extends EngineEventName> = EngineEventMap[K] extends void
  ? () => void
  : (arg: EngineEventMap[K]) => void;

export interface PlayerEngine {
  /**
   * @param url   Primary media URL (video or full muxed stream).
   * @param audioUrl Companion audio-only URL — populated only for `dual` kind,
   *                 ignored by other engines.
   */
  load(url: string, audioUrl?: string): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  seek(sec: number): void;
  setVolume(volume: number, muted: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  isPaused(): boolean;
  beginRemoteUpdate(): void;
  endRemoteUpdate(): void;
  isApplyingRemote(): boolean;
  setPlaybackRate(rate: number): void;
  getQualityLevels(): string[];
  getCurrentQuality(): string;
  setQuality(level: string): void;
  on<K extends EngineEventName>(event: K, cb: Listener<K>): () => void;
  destroy(): void;
}

export class EmitterBase {
  private readonly listeners = new Map<EngineEventName, Set<(arg: unknown) => void>>();

  protected emit<K extends EngineEventName>(event: K, payload?: EngineEventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const cb of [...set]) {
      try {
        cb(payload as unknown);
      } catch {
        /* swallow listener errors */
      }
    }
  }

  on<K extends EngineEventName>(event: K, cb: Listener<K>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    const wrapped = cb as (arg: unknown) => void;
    set.add(wrapped);
    return (): void => {
      set!.delete(wrapped);
    };
  }

  protected clearListeners(): void {
    this.listeners.clear();
  }
}
