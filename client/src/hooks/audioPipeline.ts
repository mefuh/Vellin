import { RnnoiseWorkletNode, loadRnnoise } from '@sapphi-red/web-noise-suppressor';
import rnnoiseWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseSimdWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import rnnoiseWorkletPath from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';

/**
 * Local mic processing pipeline used by `useCall`. Builds an `AudioContext`
 * graph that delivers a *processed* outbound audio track to peers:
 *
 *   mic stream → MediaStreamSource → RNNoise (neural noise suppression)
 *               → GainNode (acts as mute switch, no track renegotiation)
 *               → MediaStreamDestination → outbound RTC track
 *                                 ↘ AnalyserNode (self speaker detection)
 *
 * Browser-level `echoCancellation` / `noiseSuppression` / `autoGainControl`
 * still run on the raw mic before this stage — RNNoise is additive cleanup
 * for the residual fan/keyboard/street noise the WebRTC AGC leaves behind.
 *
 * Outbound is muted-at-source on entry (gain=0) so peers never hear pre-join
 * audio. Toggle with `setMicEnabled`.
 */

export interface AudioPipeline {
  outboundStream: MediaStream;
  outboundAudioTrack: MediaStreamTrack;
  selfAnalyser: AnalyserNode;
  setMicEnabled: (on: boolean) => void;
  teardown: () => void;
}

let rnnoiseBinaryPromise: Promise<ArrayBuffer> | null = null;
const workletAddedContexts = new WeakSet<AudioContext>();

async function ensureRnnoiseReady(ctx: AudioContext): Promise<ArrayBuffer> {
  if (!rnnoiseBinaryPromise) {
    // loadRnnoise picks the SIMD binary at runtime when WebAssembly SIMD is
    // supported (Chrome 91+, Firefox 89+) — otherwise it falls back to `url`.
    rnnoiseBinaryPromise = loadRnnoise({
      url: rnnoiseWasmPath,
      simdUrl: rnnoiseSimdWasmPath,
    }).catch((err) => {
      // Reset on failure so a retry can pull the wasm again.
      rnnoiseBinaryPromise = null;
      throw err;
    });
  }
  if (!workletAddedContexts.has(ctx)) {
    await ctx.audioWorklet.addModule(rnnoiseWorkletPath);
    workletAddedContexts.add(ctx);
  }
  return rnnoiseBinaryPromise;
}

export async function setupAudioPipeline(
  ctx: AudioContext,
  rawStream: MediaStream,
): Promise<AudioPipeline> {
  const wasmBinary = await ensureRnnoiseReady(ctx);

  const source = ctx.createMediaStreamSource(rawStream);
  const rnnoise = new RnnoiseWorkletNode(ctx, { wasmBinary, maxChannels: 1 });
  const gain = ctx.createGain();
  gain.gain.value = 0; // start muted — toggleMic flips this on
  const dest = ctx.createMediaStreamDestination();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;

  source.connect(rnnoise);
  rnnoise.connect(gain);
  gain.connect(dest);
  // Tap the post-gain signal so the self speaking indicator goes silent
  // the instant the mic is muted, even though the source mic keeps running.
  gain.connect(analyser);

  const outboundAudioTrack = dest.stream.getAudioTracks()[0];
  if (!outboundAudioTrack) throw new Error('audio pipeline: destination produced no audio track');

  let torn = false;
  return {
    outboundStream: dest.stream,
    outboundAudioTrack,
    selfAnalyser: analyser,
    setMicEnabled: (on) => {
      gain.gain.value = on ? 1 : 0;
    },
    teardown: () => {
      if (torn) return;
      torn = true;
      try { source.disconnect(); } catch { /* ignore */ }
      try { rnnoise.disconnect(); } catch { /* ignore */ }
      try { gain.disconnect(); } catch { /* ignore */ }
      try { analyser.disconnect(); } catch { /* ignore */ }
      // `RnnoiseWorkletNode.destroy()` frees the WASM module instance owned by the worklet.
      try { rnnoise.destroy(); } catch { /* ignore */ }
      try { outboundAudioTrack.stop(); } catch { /* ignore */ }
    },
  };
}
