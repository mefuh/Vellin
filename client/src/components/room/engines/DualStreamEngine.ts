import { HtmlVideoEngine } from './HtmlVideoEngine';

const DRIFT_CHECK_INTERVAL_MS = 2000;
const DRIFT_THRESHOLD_SEC = 0.15;
const DRIFT_HARD_THRESHOLD_SEC = 0.6;

/**
 * Plays a video-only stream and an audio-only stream as a single logical
 * source — exactly what YouTube's high-quality DASH split forces us into.
 *
 * The `<video>` element is the authoritative timeline: every command from the
 * controller (play/pause/seek/rate) is applied to it first, and a hidden
 * `<audio>` element is mirrored from it. Server-driven sync logic upstream
 * never touches audio directly, so this engine is fully drop-in: the
 * `RoomRuntime` and `VideoController` keep treating playback as a single
 * element.
 *
 * Drift between the two decoders accumulates slowly (~50–200ms over minutes);
 * a periodic check resnaps audio to video when it crosses a small threshold.
 */
export class DualStreamEngine extends HtmlVideoEngine {
  private audio: HTMLAudioElement | null = null;
  private audioReady = false;
  private driftTimer: ReturnType<typeof setInterval> | null = null;
  // Cached volume so we can apply it once audio finishes its initial load —
  // setting .volume before metadata is harmless but on some browsers the
  // first user gesture only unlocks audio after src is set.
  private targetVolume = 1;
  private targetMuted = false;
  // True while we've paused audio specifically to wait for the video element
  // to finish buffering. Cleared once video resumes (playing event), so the
  // user's own pause toggles are never confused with a buffer stall.
  private audioPausedForBuffer = false;

  // Hooks fired by the <video> element. We mirror them to <audio> via these
  // bound handlers so destroy() can detach them cleanly.
  private readonly onVideoPlay = (): void => {
    if (!this.audio) return;
    // Skip when this play event is a pure echo from our own audio.play() call
    // — irrelevant here since audio doesn't emit anything we react to, but
    // we still want to avoid stacking play() promises while one is pending.
    if (!this.audio.paused) return;
    void this.audio.play().catch(() => {
      /* autoplay block — handled by video's own muted-fallback path */
    });
  };
  private readonly onVideoPause = (): void => {
    if (!this.audio) return;
    // User (or remote) explicitly paused — drop the buffer-stall flag so that
    // when video resumes we don't try to auto-play audio out of order.
    this.audioPausedForBuffer = false;
    if (this.audio.paused) return;
    this.audio.pause();
  };
  private readonly onVideoSeeking = (): void => {
    if (!this.audio) return;
    // Snap audio to the new video time immediately so the post-seek gap is
    // minimised. Audio segments are an order of magnitude smaller than video
    // segments, so if we let audio just keep playing here it will race past
    // the still-buffering video — exactly the desync the user reported.
    const target = this.video.currentTime;
    if (Math.abs(this.audio.currentTime - target) > 0.05) {
      this.audio.currentTime = target;
    }
    // If the new position isn't ready in the video pipeline yet, pause audio
    // proactively. Otherwise audio (much lighter) will buffer and start
    // playing while video is still frozen on the old frame.
    if (this.video.readyState < 3 && !this.audio.paused) {
      this.audioPausedForBuffer = true;
      this.audio.pause();
    }
  };
  private readonly onVideoWaiting = (): void => {
    // The video element entered a "needs more data" state mid-playback.
    // Pause audio so the two tracks remain perceptually aligned; we'll
    // resume on the matching `playing` event.
    if (!this.audio) return;
    if (this.audio.paused) return;
    this.audioPausedForBuffer = true;
    this.audio.pause();
  };
  private readonly onVideoPlaying = (): void => {
    // Video has data again. Only resume audio if WE paused it (the user
    // hasn't pressed pause in the meantime) and the video element itself
    // is supposed to be playing.
    if (!this.audio) return;
    if (!this.audioPausedForBuffer) return;
    if (this.video.paused) {
      this.audioPausedForBuffer = false;
      return;
    }
    this.audioPausedForBuffer = false;
    void this.audio.play().catch(() => {
      /* autoplay block — surfaced via the video element's own retry path */
    });
  };
  private readonly onVideoRateChange = (): void => {
    if (!this.audio) return;
    if (this.audio.playbackRate !== this.video.playbackRate) {
      this.audio.playbackRate = this.video.playbackRate;
    }
  };

  override async load(url: string, audioUrl?: string): Promise<void> {
    this.teardownAudio();
    if (!audioUrl) {
      // Fail loud rather than silently playing video without sound: a missing
      // audioUrl for kind='dual' is a server-side bug, not a runtime fallback.
      this.emit('error', {
        kind: 'load_failed',
        message: 'Dual-поток: отсутствует audioUrl',
      });
      throw new Error('DualStreamEngine: audioUrl is required');
    }

    // Build & attach the audio element. We mount inside the video's parent so
    // it shares lifetime with the player tree (cleaned up by destroy()), and
    // mark it aria-hidden because it's an implementation detail.
    const audio = document.createElement('audio');
    audio.preload = 'auto';
    audio.setAttribute('aria-hidden', 'true');
    audio.style.display = 'none';
    audio.src = audioUrl;
    audio.volume = this.targetVolume;
    audio.muted = this.targetMuted;
    (this.video.parentElement ?? document.body).appendChild(audio);
    this.audio = audio;

    // The <video> element carries the picture only — keep it muted forever so
    // we never play two audio sources at once. The HtmlVideoEngine's setVolume
    // override below routes volume changes to <audio> instead.
    this.video.muted = true;

    // Mirror playback state on the video → audio direction. Audio → video is
    // never mirrored: only the video element is authoritative for the
    // controller and the server.
    this.video.addEventListener('play', this.onVideoPlay);
    this.video.addEventListener('pause', this.onVideoPause);
    this.video.addEventListener('seeking', this.onVideoSeeking);
    this.video.addEventListener('waiting', this.onVideoWaiting);
    this.video.addEventListener('playing', this.onVideoPlaying);
    this.video.addEventListener('ratechange', this.onVideoRateChange);

    const audioReadyP = new Promise<void>((resolve, reject) => {
      const onReady = (): void => {
        audio.removeEventListener('loadedmetadata', onReady);
        audio.removeEventListener('error', onErr);
        this.audioReady = true;
        resolve();
      };
      const onErr = (): void => {
        audio.removeEventListener('loadedmetadata', onReady);
        audio.removeEventListener('error', onErr);
        reject(new Error('audio load failed'));
      };
      audio.addEventListener('loadedmetadata', onReady);
      audio.addEventListener('error', onErr);
    });

    try {
      // Load video and audio in parallel; only emit 'ready' when both are
      // good. A successful video without audio would mean silent playback.
      await Promise.all([super.load(url), audioReadyP]);
    } catch (err) {
      // super.load already emitted its own error; emit audio-specific one if
      // that was the failing side. Either way, propagate.
      if (!this.audioReady) {
        this.emit('error', {
          kind: 'load_failed',
          message: 'Не удалось загрузить аудио-поток',
        });
      }
      this.teardownAudio();
      throw err;
    }

    // Start drift correction once we're loaded. Cleared by destroy().
    if (this.driftTimer) clearInterval(this.driftTimer);
    this.driftTimer = setInterval(() => this.correctDrift(), DRIFT_CHECK_INTERVAL_MS);
  }

  override async play(): Promise<void> {
    // Delegate to HtmlVideoEngine.play() — it handles autoplay-policy retries
    // for the video. Our `onVideoPlay` will pull <audio> along.
    await super.play();
    // Belt-and-braces: if for any reason the play event didn't fire (some
    // browsers skip it when video was already in the 'playing' state), start
    // audio explicitly so the user hears something.
    if (this.audio && this.audio.paused) {
      try {
        await this.audio.play();
      } catch {
        /* autoplay block: video already retried muted — audio simply stays
         * paused; UX will catch up once user clicks unmute. */
      }
    }
  }

  override pause(): void {
    super.pause();
    if (this.audio && !this.audio.paused) this.audio.pause();
  }

  override seek(sec: number): void {
    super.seek(sec);
    if (this.audio) {
      const target = Math.max(0, sec);
      if (Math.abs(this.audio.currentTime - target) > 0.05) {
        this.audio.currentTime = target;
      }
    }
  }

  override setVolume(volume: number, muted: boolean): void {
    // Route all volume control to the audio element. The video element stays
    // muted forever (otherwise we'd play silence-or-original audio twice).
    const v = Math.max(0, Math.min(1, volume));
    this.targetVolume = v;
    this.targetMuted = muted;
    if (this.audio) {
      this.audio.volume = v;
      this.audio.muted = muted;
    }
    // Keep video muted explicitly — some upstream code may try to flip
    // video.muted directly; we re-assert here to be safe.
    this.video.muted = true;
  }

  override setPlaybackRate(rate: number): void {
    super.setPlaybackRate(rate);
    if (this.audio) this.audio.playbackRate = rate;
  }

  override destroy(): void {
    this.teardownAudio();
    super.destroy();
  }

  private correctDrift(): void {
    if (!this.audio) return;
    // Skip while either side is mid-seek or paused — drift "measurement" is
    // only meaningful during steady playback.
    if (this.video.paused || this.audio.paused) return;
    if (this.video.seeking || this.audio.seeking) return;
    if (this.video.readyState < 3) return;

    const delta = this.audio.currentTime - this.video.currentTime;
    const absDelta = Math.abs(delta);
    if (absDelta < DRIFT_THRESHOLD_SEC) return;

    // Soft snap. For larger drifts we mute briefly to mask the pop that
    // hard-seeking the audio element can produce on some codecs.
    if (absDelta >= DRIFT_HARD_THRESHOLD_SEC && !this.targetMuted) {
      const wasMuted = this.audio.muted;
      this.audio.muted = true;
      this.audio.currentTime = this.video.currentTime;
      // Restore mute state after a tick — by then the audio decoder has
      // resumed and we won't catch the seek-pop on the speakers.
      setTimeout(() => {
        if (this.audio) this.audio.muted = wasMuted;
      }, 200);
    } else {
      this.audio.currentTime = this.video.currentTime;
    }
  }

  private teardownAudio(): void {
    if (this.driftTimer) {
      clearInterval(this.driftTimer);
      this.driftTimer = null;
    }
    if (this.audio) {
      try {
        this.video.removeEventListener('play', this.onVideoPlay);
        this.video.removeEventListener('pause', this.onVideoPause);
        this.video.removeEventListener('seeking', this.onVideoSeeking);
        this.video.removeEventListener('waiting', this.onVideoWaiting);
        this.video.removeEventListener('playing', this.onVideoPlaying);
        this.video.removeEventListener('ratechange', this.onVideoRateChange);
        this.audio.pause();
        this.audio.removeAttribute('src');
        this.audio.load();
        this.audio.remove();
      } catch {
        /* ignore teardown errors — element may already be detached */
      }
      this.audio = null;
    }
    this.audioReady = false;
    this.audioPausedForBuffer = false;
  }
}
