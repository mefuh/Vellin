import type { VideoState, VideoStatus } from '@vellin/shared';
import type { PlayerEngine } from './engines/PlayerEngine';

// Drift bands for the 5-second heartbeat correction.
const SOFT_BAND_SEC = 0.4; // below this we are in sync — do nothing
const HARD_BAND_SEC = 2.0; // at/above this — snap with a hard seek
const SOFT_CORRECTION_MS = 1500;
// On a discrete event (play/pause/seek) snap into place if off by more than this.
const EVENT_SNAP_SEC = 0.4;
// A 'pause' fired within this distance of the end is end-of-media, not a user.
const END_EPSILON_SEC = 0.5;

export type LocalIntent =
  | { kind: 'play'; positionSec: number }
  | { kind: 'pause'; positionSec: number }
  | { kind: 'seek'; positionSec: number; playing: boolean };

export interface VideoControllerOptions {
  getClockOffsetMs: () => number;
  onLocalIntent: (intent: LocalIntent) => void;
  /** Идёт ли сейчас буферизация — во время неё дрифт не корректируем. */
  isBuffering?: () => boolean;
}

/**
 * Engine-agnostic glue between the authoritative video state from the server
 * and a concrete player implementation (HTML5 <video>, HLS, DASH, torrent).
 *
 * Echo suppression is **semantic**, not time-based: a play/pause event coming
 * out of the media element is forwarded to the server only when it genuinely
 * changes the shared status away from what the server last told us. An event
 * that merely re-confirms the intended status — the asynchronous echo of our
 * own `engine.play()/pause()`, or a late joiner clicking "play" to satisfy the
 * browser autoplay policy — is dropped. A joiner can therefore never re-anchor
 * the room just by catching up to it.
 */
export class VideoController {
  private engine: PlayerEngine | null = null;
  private softTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribers: Array<() => void> = [];

  /** Highest server event sequence applied. Resets to 0 on a fresh engine. */
  private lastSeq = 0;
  /** False until the first server state has been applied to the current engine. */
  private hasBaseline = false;
  /**
   * Shared play/paused status as last known from the server, advanced
   * optimistically when we forward a local intent so that rapid local toggles
   * are not mistaken for echo before the server round-trip completes.
   */
  private intendedStatus: VideoStatus = 'paused';

  constructor(private readonly opts: VideoControllerOptions) {}

  attach(engine: PlayerEngine): void {
    if (this.engine === engine) return;
    this.detach();
    this.engine = engine;
    // Only play/pause are observed. Seeks are issued explicitly by the UI
    // (the custom progress bar) — the native <video> exposes no scrub control —
    // so any 'seeked' event is always the echo of a programmatic seek.
    this.unsubscribers.push(
      engine.on('play', () => this.handleEnginePlay()),
      engine.on('pause', () => this.handleEnginePause()),
    );
  }

  detach(): void {
    for (const u of this.unsubscribers) u();
    this.unsubscribers = [];
    this.clearSoftTimer();
    this.engine = null;
  }

  reset(): void {
    this.lastSeq = 0;
    this.hasBaseline = false;
    this.intendedStatus = 'paused';
    this.clearSoftTimer();
    this.engine?.setPlaybackRate(1);
  }

  /**
   * Apply an authoritative server state. Called for every welcome, every
   * discrete event (`video_apply`) and every 5s heartbeat (`video_sync`) — the
   * controller tells them apart by the sequence number:
   *  - seq advanced      → discrete event: snap to the new position.
   *  - seq went backwards → server restarted: re-baseline from scratch.
   *  - seq unchanged     → heartbeat: gentle drift correction only.
   *
   * `force` re-applies as a re-baseline regardless of seq — used to catch a
   * late joiner up once they click through the browser's autoplay block.
   */
  applyServerState(state: VideoState, force = false): void {
    const engine = this.engine;
    if (!engine) return;

    // seq only ever decreases when the server process restarted (TCP keeps WS
    // messages ordered within a session), so a backwards step is a re-baseline.
    const rebaseline = force || !this.hasBaseline || state.lastEventSeq < this.lastSeq;
    const discrete = state.lastEventSeq > this.lastSeq;
    this.lastSeq = state.lastEventSeq;
    this.hasBaseline = true;
    this.intendedStatus = state.status;

    const playing = state.status === 'playing';
    const target = this.targetPosition(state.positionSec, state.anchorServerTs, playing);

    engine.beginRemoteUpdate();
    try {
      if (rebaseline || discrete) {
        // Authoritative change — snap into place when meaningfully off.
        if (Math.abs(engine.getCurrentTime() - target) > EVENT_SNAP_SEC) {
          engine.seek(target);
        }
        engine.setPlaybackRate(1);
        this.clearSoftTimer();
      } else {
        // Heartbeat — keep accumulated drift inside the soft band.
        this.driftCorrect(engine, state.positionSec, target, playing);
      }
      if (playing) {
        void engine.play().catch(() => {
          /* autoplay blocked — surfaced separately via the engine 'error' event */
        });
      } else {
        engine.pause();
      }
    } finally {
      engine.endRemoteUpdate();
    }
  }

  private driftCorrect(
    engine: PlayerEngine,
    positionSec: number,
    target: number,
    playing: boolean,
  ): void {
    // Во время буферизации коррекция бесполезна и провоцирует петлю «догнал →
    // снова затык»: держим обычную скорость и ждём, пока догрузится.
    if (this.opts.isBuffering?.()) {
      engine.setPlaybackRate(1);
      this.clearSoftTimer();
      return;
    }
    if (!playing) {
      if (Math.abs(engine.getCurrentTime() - positionSec) > HARD_BAND_SEC) {
        engine.seek(positionSec);
      }
      return;
    }
    const drift = engine.getCurrentTime() - target; // +ahead / -behind
    const abs = Math.abs(drift);
    if (abs < SOFT_BAND_SEC) {
      engine.setPlaybackRate(1);
      this.clearSoftTimer();
      return;
    }
    if (abs >= HARD_BAND_SEC) {
      engine.seek(target);
      engine.setPlaybackRate(1);
      this.clearSoftTimer();
      return;
    }
    // Плавная пропорциональная подстройка скорости: чем больше дрифт в мягкой
    // полосе, тем сильнее (0.85..1.15) — тише и приятнее фикс. 0.94/1.06.
    const span = (abs - SOFT_BAND_SEC) / (HARD_BAND_SEC - SOFT_BAND_SEC); // 0..1
    const adjust = 0.05 + Math.max(0, Math.min(1, span)) * 0.1; // 0.05..0.15
    engine.setPlaybackRate(drift > 0 ? 1 - adjust : 1 + adjust);
    this.clearSoftTimer();
    this.softTimer = setTimeout(() => {
      this.engine?.setPlaybackRate(1);
      this.softTimer = null;
    }, SOFT_CORRECTION_MS);
  }

  private handleEnginePlay(): void {
    const engine = this.engine;
    if (!engine) return;
    // Already playing as far as the room is concerned → this is the echo of our
    // own catch-up (or a joiner clicking past the autoplay block). Drop it.
    if (this.intendedStatus === 'playing') return;
    this.intendedStatus = 'playing';
    this.opts.onLocalIntent({ kind: 'play', positionSec: engine.getCurrentTime() });
  }

  private handleEnginePause(): void {
    const engine = this.engine;
    if (!engine) return;
    if (this.intendedStatus === 'paused') return;
    // The media element fires 'pause' right before 'ended'; that is the video
    // finishing, not a user pausing the room for everyone.
    const duration = engine.getDuration();
    if (duration > 0 && engine.getCurrentTime() >= duration - END_EPSILON_SEC) return;
    this.intendedStatus = 'paused';
    this.opts.onLocalIntent({ kind: 'pause', positionSec: engine.getCurrentTime() });
  }

  private targetPosition(positionSec: number, anchorServerTs: number, isPlaying: boolean): number {
    if (!isPlaying) return positionSec;
    const nowServer = Date.now() + this.opts.getClockOffsetMs();
    return positionSec + Math.max(0, (nowServer - anchorServerTs) / 1000);
  }

  private clearSoftTimer(): void {
    if (this.softTimer) {
      clearTimeout(this.softTimer);
      this.softTimer = null;
    }
  }
}
