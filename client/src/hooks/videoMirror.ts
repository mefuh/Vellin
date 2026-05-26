/**
 * Builds an "outgoing mirror" pipeline: takes a raw camera MediaStreamTrack,
 * paints each frame to an offscreen canvas with `ctx.scale(-1, 1)`, and emits
 * a fresh MediaStreamTrack from `canvas.captureStream()`. That track is sent
 * to peers instead of the raw camera — so the mirror is visible to everyone,
 * not just locally.
 *
 * Trade-offs:
 *  - Cost: one rAF loop + per-frame `drawImage` (~CPU/GPU compositing). At
 *    640×360@24fps this is negligible on desktops; mobile may see a small hit.
 *  - Latency: <1 frame; visually indistinguishable.
 *  - The output track has a different `id` from the source — switchCamera
 *    rebuilds the pipeline and calls `sender.replaceTrack` again.
 */

export interface VideoMirrorPipeline {
  outputTrack: MediaStreamTrack;
  teardown: () => void;
}

export function startMirrorPipeline(source: MediaStreamTrack): VideoMirrorPipeline {
  const settings = source.getSettings();
  const width = settings.width ?? 640;
  const height = settings.height ?? 360;
  const fps = settings.frameRate ?? 24;

  const sourceStream = new MediaStream([source]);
  const videoEl = document.createElement('video');
  videoEl.srcObject = sourceStream;
  videoEl.muted = true;
  videoEl.playsInline = true;
  // Detached from the DOM — Chrome still decodes frames as long as play()
  // has been called and srcObject is set.
  void videoEl.play().catch((err) => {
    console.warn('[call] mirror: video.play() failed', err);
  });

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    try { videoEl.pause(); videoEl.srcObject = null; } catch { /* ignore */ }
    throw new Error('mirror: 2d canvas context unavailable');
  }

  let raf: number | null = null;
  const tick = (): void => {
    try {
      if (videoEl.readyState >= 2) {
        ctx.save();
        ctx.setTransform(-1, 0, 0, 1, width, 0);
        ctx.drawImage(videoEl, 0, 0, width, height);
        ctx.restore();
      }
    } catch {
      /* ignore — canvas can momentarily be in a bad state during resize */
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  const out = canvas.captureStream(fps);
  const outputTrack = out.getVideoTracks()[0];
  if (!outputTrack) {
    if (raf != null) cancelAnimationFrame(raf);
    try { videoEl.pause(); videoEl.srcObject = null; } catch { /* ignore */ }
    throw new Error('mirror: captureStream produced no video track');
  }

  let torn = false;
  return {
    outputTrack,
    teardown: () => {
      if (torn) return;
      torn = true;
      if (raf != null) cancelAnimationFrame(raf);
      raf = null;
      try { outputTrack.stop(); } catch { /* ignore */ }
      try { videoEl.pause(); videoEl.srcObject = null; } catch { /* ignore */ }
    },
  };
}
