import type { S2CVideoApply, S2CVideoSync, VideoState } from '@vellin/shared';
import type { PlayerEngine } from './engines/PlayerEngine';

const SOFT_CORRECTION_THRESHOLD_SEC = 0.4;
const HARD_SEEK_THRESHOLD_SEC = 2.0;
const SOFT_CORRECTION_DURATION_MS = 1500;

export type LocalIntent =
  | { kind: 'play'; positionSec: number }
  | { kind: 'pause'; positionSec: number }
  | { kind: 'seek'; positionSec: number; playing: boolean };

export interface VideoControllerOptions {
  getClockOffsetMs: () => number;
  onLocalIntent: (intent: LocalIntent) => void;
}

/**
 * Engine-agnostic glue between the authoritative video state from the server
 * and a concrete player implementation (HTML5 <video> or YouTube iframe).
 */
export class VideoController {
  private engine: PlayerEngine | null = null;
  private softCorrectionTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSeq = 0;
  private unsubscribers: Array<() => void> = [];

  constructor(private readonly opts: VideoControllerOptions) {}

  attach(engine: PlayerEngine): void {
    if (this.engine === engine) return;
    this.detach();
    this.engine = engine;
    this.unsubscribers.push(
      engine.on('play', () => this.opts.onLocalIntent({ kind: 'play', positionSec: engine.getCurrentTime() })),
      engine.on('pause', () => this.opts.onLocalIntent({ kind: 'pause', positionSec: engine.getCurrentTime() })),
      engine.on('seeked', () =>
        this.opts.onLocalIntent({
          kind: 'seek',
          positionSec: engine.getCurrentTime(),
          playing: !engine.isPaused(),
        }),
      ),
    );
  }

  detach(): void {
    for (const u of this.unsubscribers) u();
    this.unsubscribers = [];
    if (this.softCorrectionTimer) clearTimeout(this.softCorrectionTimer);
    this.engine = null;
  }

  reset(): void {
    this.lastSeq = 0;
    if (this.softCorrectionTimer) {
      clearTimeout(this.softCorrectionTimer);
      this.softCorrectionTimer = null;
    }
    this.engine?.setPlaybackRate(1);
  }

  applyInitial(state: VideoState): void {
    this.lastSeq = state.lastEventSeq;
    if (!this.engine) return;
    const target = this.targetPosition(state.positionSec, state.anchorServerTs, state.status === 'playing');
    this.engine.beginRemoteUpdate();
    this.engine.seek(target);
    if (state.status === 'playing') {
      void this.engine.play().catch(() => {
        /* autoplay denied — overlay will be shown */
      });
    } else {
      this.engine.pause();
    }
    this.engine.endRemoteUpdate();
  }

  applyEvent(msg: S2CVideoApply): void {
    if (msg.seq < this.lastSeq) return;
    this.lastSeq = msg.seq;
    if (!this.engine) return;
    const target = this.targetPosition(msg.positionSec, msg.anchorServerTs, msg.status === 'playing');
    this.engine.beginRemoteUpdate();
    const drift = Math.abs(this.engine.getCurrentTime() - target);
    if (msg.action === 'seek' || drift > HARD_SEEK_THRESHOLD_SEC) {
      this.engine.seek(target);
    }
    if (msg.status === 'playing') {
      void this.engine.play().catch(() => undefined);
    } else {
      this.engine.pause();
    }
    this.engine.endRemoteUpdate();
  }

  applySync(msg: S2CVideoSync): void {
    if (msg.seq < this.lastSeq) return;
    this.lastSeq = msg.seq;
    if (!this.engine) return;

    if (msg.status === 'paused') {
      const target = msg.positionSec;
      const drift = Math.abs(this.engine.getCurrentTime() - target);
      this.engine.beginRemoteUpdate();
      if (drift > HARD_SEEK_THRESHOLD_SEC) this.engine.seek(target);
      if (!this.engine.isPaused()) this.engine.pause();
      this.engine.endRemoteUpdate();
      return;
    }

    const target = this.targetPosition(msg.positionSec, msg.anchorServerTs, true);
    const drift = this.engine.getCurrentTime() - target;
    const absDrift = Math.abs(drift);

    if (absDrift < SOFT_CORRECTION_THRESHOLD_SEC) {
      this.engine.setPlaybackRate(1);
      if (this.softCorrectionTimer) {
        clearTimeout(this.softCorrectionTimer);
        this.softCorrectionTimer = null;
      }
      if (this.engine.isPaused()) {
        this.engine.beginRemoteUpdate();
        void this.engine.play().catch(() => undefined);
        this.engine.endRemoteUpdate();
      }
      return;
    }
    if (absDrift >= HARD_SEEK_THRESHOLD_SEC) {
      this.engine.beginRemoteUpdate();
      this.engine.seek(target);
      this.engine.setPlaybackRate(1);
      if (this.engine.isPaused()) void this.engine.play().catch(() => undefined);
      this.engine.endRemoteUpdate();
      return;
    }
    const rate = drift > 0 ? 0.94 : 1.06;
    this.engine.setPlaybackRate(rate);
    if (this.softCorrectionTimer) clearTimeout(this.softCorrectionTimer);
    this.softCorrectionTimer = setTimeout(() => {
      this.engine?.setPlaybackRate(1);
      this.softCorrectionTimer = null;
    }, SOFT_CORRECTION_DURATION_MS);
    if (this.engine.isPaused()) {
      this.engine.beginRemoteUpdate();
      void this.engine.play().catch(() => undefined);
      this.engine.endRemoteUpdate();
    }
  }

  private targetPosition(positionSec: number, anchorServerTs: number, isPlaying: boolean): number {
    if (!isPlaying) return positionSec;
    const nowServer = Date.now() + this.opts.getClockOffsetMs();
    return positionSec + Math.max(0, (nowServer - anchorServerTs) / 1000);
  }
}
