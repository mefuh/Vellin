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
  /**
   * Включить или обойти RNNoise. Нужен, чтобы тумблер шумоподавления в
   * настройках действительно его снимал: флаг браузера убирает только свой
   * слой обработки, а этот живёт поверх него и остался бы работать.
   */
  setDenoiseEnabled: (on: boolean) => void;
  /**
   * Swap the input MediaStream while keeping the rest of the graph (and the
   * outbound RTC track) intact. Peers don't see a renegotiation — the
   * MediaStreamDestination keeps producing the same track id; only what
   * feeds into it changes.
   */
  replaceMicStream: (newStream: MediaStream) => void;
  /**
   * Отвод для проверки микрофона: звук после всей обработки — ровно то, что
   * уходит собеседнику, — но до выключателя микрофона. Так человек слышит
   * себя, как его слышат, даже когда для собеседника он выключен.
   */
  startMonitor: () => MediaStream;
  stopMonitor: () => void;
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

  let source = ctx.createMediaStreamSource(rawStream);
  const rnnoise = new RnnoiseWorkletNode(ctx, { wasmBinary, maxChannels: 1 });
  const gain = ctx.createGain();
  gain.gain.value = 0; // start muted — toggleMic flips this on
  const dest = ctx.createMediaStreamDestination();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  // Отвод проверки микрофона подключается только на время проверки.
  const monitorDest = ctx.createMediaStreamDestination();
  let monitoring = false;

  // Маршрут собирается заново при каждой смене входа или тумблера: узлы те же,
  // меняются только связи, поэтому исходящая дорожка остаётся прежней и
  // собеседник ничего не пересогласовывает.
  let denoise = true;
  const route = (): void => {
    try { source.disconnect(); } catch { /* ignore */ }
    try { rnnoise.disconnect(); } catch { /* ignore */ }
    const processed = denoise ? rnnoise : source;
    if (denoise) source.connect(rnnoise);
    processed.connect(gain);
    if (monitoring) processed.connect(monitorDest);
  };
  route();
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
    setDenoiseEnabled: (on) => {
      if (torn || denoise === on) return;
      denoise = on;
      route();
    },
    startMonitor: () => {
      if (!torn && !monitoring) {
        monitoring = true;
        route();
      }
      return monitorDest.stream;
    },
    stopMonitor: () => {
      if (torn || !monitoring) return;
      monitoring = false;
      route();
    },
    replaceMicStream: (newStream) => {
      if (torn) return;
      try { source.disconnect(); } catch { /* ignore */ }
      source = ctx.createMediaStreamSource(newStream);
      route();
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
