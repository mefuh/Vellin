import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  C2S,
  CallMember,
  CallSignalPayload,
  IceCandidatePayload,
  RtcConfig,
} from '@vellin/shared';
import { callSignalBus } from '../ws/callSignalBus';
import { callSpeakingBus } from '../ws/callSpeakingBus';
import { useRoomStore } from '../stores/roomStore';
import { useCallSettingsStore } from '../stores/callSettingsStore';
import type { WSConnectionState } from '../ws/WSClient';
import { setupAudioPipeline, type AudioPipeline } from './audioPipeline';
import { startMirrorPipeline, type VideoMirrorPipeline } from './videoMirror';
import { isIOS } from '../utils/platform';

/**
 * WebRTC P2P-mesh call hook. One instance per room. Handles:
 *  - mic/camera capture (default mic muted, camera off);
 *  - per-peer `RTCPeerConnection` with the perfect-negotiation pattern;
 *  - signalling via the shared `callSignalBus`;
 *  - active-speaker detection via `AudioContext` analysers;
 *  - graceful resync after a WS reconnect.
 *
 * Audio playback lives in `<RemoteAudioMixer>` so it survives every fullscreen
 * / panel-collapse toggle — the hook only exposes `remoteStreams`.
 */

export type CallState = 'idle' | 'connecting' | 'in';
export type PermissionError = 'denied' | 'no-mic' | null;

export interface UseCallOpts {
  myUserId: string | null;
  myUserKind: 'user' | 'guest' | null;
  rtcConfig: RtcConfig | null;
  callMembers: CallMember[];
  wsState: WSConnectionState;
  send: (msg: C2S) => boolean;
}

export interface UseCallApi {
  state: CallState;
  permissionError: PermissionError;
  myStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  speaking: Set<string>;
  /** Latest enumerateDevices snapshot — populated once the mic permission is granted. */
  availableDevices: { mics: MediaDeviceInfo[]; cameras: MediaDeviceInfo[] };
  join: (opts: { withVideo: boolean }) => Promise<void>;
  leave: () => void;
  toggleMic: () => void;
  toggleCamera: () => Promise<void>;
  /** Switch the active mic without renegotiating SDP (pipeline-internal swap). */
  switchMic: (deviceId: string) => Promise<void>;
  /** Switch the active camera without renegotiating SDP (`sender.replaceTrack`). */
  switchCamera: (deviceId: string) => Promise<void>;
}

interface PeerRecord {
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  isSettingRemoteAnswer: boolean;
  /**
   * Предсогласованный отправитель видео (из sendrecv-трансивера, созданного
   * сразу при создании PC). Камеру включаем/выключаем через его replaceTrack —
   * без повторного SDP-согласования, иначе iOS Safari не доставляет видеотрек,
   * добавленный после initial-negotiation.
   */
  videoSender: RTCRtpSender | null;
}

interface AnalyserRecord {
  // `source` is non-null only for analysers we own (e.g. raw-mic fallback);
  // when the pipeline owns the AnalyserNode it manages disconnection itself.
  source: MediaStreamAudioSourceNode | null;
  analyser: AnalyserNode;
  data: Uint8Array<ArrayBuffer>;
}

const VIDEO_CONSTRAINTS_BASE: MediaTrackConstraints = {
  width: { ideal: 640 },
  height: { ideal: 360 },
  frameRate: { ideal: 24 },
};
const AUDIO_CONSTRAINTS_BASE: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: 48000,
};

function audioConstraints(deviceId: string | null, mode: 'ideal' | 'exact' = 'ideal'): MediaTrackConstraints {
  // `ideal` on initial join → graceful fallback if the previously chosen device
  // is unplugged. `exact` on explicit switch → guarantee we get the device the
  // user just picked (otherwise the browser ignores the hint).
  return deviceId
    ? { ...AUDIO_CONSTRAINTS_BASE, deviceId: { [mode]: deviceId } as ConstrainDOMString }
    : AUDIO_CONSTRAINTS_BASE;
}

function videoConstraints(deviceId: string | null, mode: 'ideal' | 'exact' = 'ideal'): MediaTrackConstraints {
  return deviceId
    ? { ...VIDEO_CONSTRAINTS_BASE, deviceId: { [mode]: deviceId } as ConstrainDOMString }
    : VIDEO_CONSTRAINTS_BASE;
}
const SPEAKING_THRESHOLD = 0.04;
const SPEAKING_LINGER_MS = 350;

export function useCall(opts: UseCallOpts): UseCallApi {
  const { myUserId, myUserKind, rtcConfig, callMembers, wsState, send } = opts;

  const [state, setState] = useState<CallState>('idle');
  const [permissionError, setPermissionError] = useState<PermissionError>(null);
  const [myStream, setMyStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [availableDevices, setAvailableDevices] = useState<{
    mics: MediaDeviceInfo[];
    cameras: MediaDeviceInfo[];
  }>({ mics: [], cameras: [] });

  const pcsRef = useRef<Map<string, PeerRecord>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  // `outboundStreamRef` is what we actually feed into each PC: processed
  // audio (via RNNoise pipeline) + any added video tracks. Separate from
  // `localStreamRef` so the local self-tile keeps showing raw camera.
  const outboundStreamRef = useRef<MediaStream | null>(null);
  const pipelineRef = useRef<AudioPipeline | null>(null);
  // Mirror-pipeline state. `rawCameraTrackRef` is the actual webcam capture
  // that lives in `localStreamRef` for self-preview rendering. The mirror
  // pipeline (when active) paints that track flipped onto a canvas and emits
  // a new track which is what we actually send on the wire.
  const mirrorPipelineRef = useRef<VideoMirrorPipeline | null>(null);
  const rawCameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const micOnRef = useRef<boolean>(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<Map<string, AnalyserRecord>>(new Map());
  const lastSpokeRef = useRef<Map<string, number>>(new Map());
  const rafRef = useRef<number | null>(null);
  // Last self-speaking value the server was told about — used to debounce
  // the `call_speaking` broadcast down to actual transitions.
  const prevSelfSpeakingRef = useRef<boolean>(false);
  const stateRef = useRef<CallState>('idle');
  stateRef.current = state;

  // ── Signaling envelope helpers ──────────────────────────────────────────

  const sendSignal = useCallback(
    (toUserId: string, payload: CallSignalPayload): void => {
      send({ t: 'call_signal', toUserId, payload, clientTs: Date.now() });
    },
    [send],
  );

  const broadcastMyMedia = useCallback((): void => {
    // Authoritative source for mic state is the GainNode ref (track.enabled
    // doesn't reflect the post-RNNoise mute when the pipeline is active).
    const stream = localStreamRef.current;
    const audio = micOnRef.current;
    const video = !!stream?.getVideoTracks()[0]?.enabled;
    useRoomStore.getState().setMyMedia({ audio, video });
    send({ t: 'call_media', audio, video, clientTs: Date.now() });
  }, [send]);

  // ── Speaker detection ───────────────────────────────────────────────────

  const ensureAudioCtx = useCallback((): AudioContext => {
    if (!audioCtxRef.current) {
      const Ctor: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new Ctor();
    }
    // Browsers start the context suspended until a user gesture — resume on
    // each entry so attaching an analyser doesn't silently no-op.
    if (audioCtxRef.current.state === 'suspended') {
      void audioCtxRef.current.resume().catch(() => undefined);
    }
    return audioCtxRef.current;
  }, []);

  const attachAnalyser = useCallback(
    (key: string, stream: MediaStream): void => {
      if (analysersRef.current.has(key)) return;
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) return;
      try {
        const ctx = ensureAudioCtx();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        analysersRef.current.set(key, {
          source,
          analyser,
          data: new Uint8Array(new ArrayBuffer(analyser.fftSize)),
        });
      } catch {
        /* ignored — autoplay policies can block on some browsers */
      }
    },
    [ensureAudioCtx],
  );

  const detachAnalyser = useCallback((key: string): void => {
    const rec = analysersRef.current.get(key);
    if (!rec) return;
    if (rec.source) {
      try {
        rec.source.disconnect();
      } catch {
        /* ignore */
      }
    }
    analysersRef.current.delete(key);
    lastSpokeRef.current.delete(key);
  }, []);

  // rAF loop measuring RMS for the local analyser (key = myUserId). Only the
  // local user's key is managed here — remote entries come from the
  // `callSpeakingBus` subscription below. On every self transition we send
  // `call_speaking` so peers can render the same indicator.
  useEffect(() => {
    if (state !== 'in' || !myUserId) return;
    let active = true;
    const tick = (): void => {
      if (!active) return;
      const now = performance.now();
      let selfActive = false;
      for (const [key, rec] of analysersRef.current.entries()) {
        rec.analyser.getByteTimeDomainData(rec.data);
        let sumSq = 0;
        for (let i = 0; i < rec.data.length; i++) {
          const v = (rec.data[i]! - 128) / 128;
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / rec.data.length);
        if (rms > SPEAKING_THRESHOLD) {
          lastSpokeRef.current.set(key, now);
        }
        const last = lastSpokeRef.current.get(key) ?? 0;
        const isActive = now - last < SPEAKING_LINGER_MS;
        if (key === myUserId) selfActive = isActive;
      }

      // Mutate only the self entry — preserve remote entries set by the bus.
      setSpeaking((prev) => {
        const has = prev.has(myUserId);
        if (has === selfActive) return prev;
        const next = new Set(prev);
        if (selfActive) next.add(myUserId);
        else next.delete(myUserId);
        return next;
      });

      // Broadcast to peers on transitions only. Muted mic ⇒ definitely not
      // speaking (analyser is post-mute, but cheap guard).
      if (selfActive !== prevSelfSpeakingRef.current) {
        prevSelfSpeakingRef.current = selfActive;
        send({ t: 'call_speaking', speaking: selfActive, clientTs: Date.now() });
      }

      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      active = false;
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [state, myUserId, send]);

  // Remote speaker indicators come over WS via `callSpeakingBus`. Merge them
  // into the same `speaking` set the local analyser writes to.
  useEffect(() => {
    return callSpeakingBus.on((peerUserId, speaking) => {
      if (peerUserId === myUserId) return; // self managed by local analyser
      setSpeaking((prev) => {
        const has = prev.has(peerUserId);
        if (has === speaking) return prev;
        const next = new Set(prev);
        if (speaking) next.add(peerUserId);
        else next.delete(peerUserId);
        return next;
      });
    });
  }, [myUserId]);

  // ── Peer connection lifecycle ───────────────────────────────────────────

  const createPeer = useCallback(
    (peerUserId: string): PeerRecord => {
      if (!rtcConfig || !myUserId) throw new Error('useCall: missing rtcConfig / myUserId');
      const pc = new RTCPeerConnection({ iceServers: rtcConfig.iceServers as RTCIceServer[] });
      const polite = myUserId < peerUserId;
      const rec: PeerRecord = {
        pc,
        polite,
        makingOffer: false,
        isSettingRemoteAnswer: false,
        videoSender: null,
      };

      // Аудио добавляем через addTrack — оно есть всегда после входа и
      // описывается в initial-offer. Видео же выносим в ОТДЕЛЬНЫЙ
      // предсогласованный sendrecv-трансивер: тогда включение камеры в
      // середине звонка — это replaceTrack по уже существующему m-line, без
      // повторного SDP-согласования (которое iOS Safari часто не доводит до
      // доставки трека). Видео работает в рамках initial-negotiation, которое
      // точно проходит — иначе и аудио бы не подключилось.
      const outbound = outboundStreamRef.current;
      if (outbound) {
        for (const track of outbound.getAudioTracks()) {
          try {
            pc.addTrack(track, outbound);
          } catch (err) {
            console.warn(`[call] ${peerUserId} addTrack(audio) failed`, err);
          }
        }
        const initialVideo = outbound.getVideoTracks()[0] ?? null;
        try {
          const videoTx = pc.addTransceiver('video', { direction: 'sendrecv', streams: [outbound] });
          rec.videoSender = videoTx.sender;
          if (initialVideo) {
            void videoTx.sender
              .replaceTrack(initialVideo)
              .catch((err) => console.warn('[call] initial video replaceTrack failed', err));
          }
        } catch (err) {
          console.warn('[call] addTransceiver(video) failed', err);
        }
        console.log(
          `[call] createPeer ${peerUserId} polite=${polite} audio=${!!outbound.getAudioTracks()[0]} video=${!!initialVideo}`,
        );
      } else {
        console.warn(`[call] createPeer ${peerUserId}: no outbound stream — peer will be receive-only`);
      }

      pc.onicecandidate = (ev) => {
        const candidate: IceCandidatePayload | null = ev.candidate ? ev.candidate.toJSON() : null;
        sendSignal(peerUserId, { kind: 'ice', candidate });
      };

      pc.ontrack = (ev) => {
        // The browser emits ontrack as tracks are added; the first stream entry
        // is the inbound stream for this peer.
        const stream = ev.streams[0] ?? new MediaStream([ev.track]);
        console.log(
          `[call] ${peerUserId} ontrack ${ev.track.kind} streamId=${stream.id} streamTracks=${stream
            .getTracks()
            .map((t) => t.kind)
            .join(',')}`,
        );
        setRemoteStreams((prev) => {
          if (prev.get(peerUserId) === stream) return prev;
          const next = new Map(prev);
          next.set(peerUserId, stream);
          return next;
        });
        // NB: do NOT attach a Web Audio analyser to a remote PeerConnection
        // stream — Chrome silently mutes the <audio> playback for that stream
        // once a MediaStreamAudioSourceNode owns it. Active-speaker indicator
        // for remote peers is intentionally left for a future getStats() pass.
      };

      pc.onnegotiationneeded = async () => {
        try {
          rec.makingOffer = true;
          console.log(`[call] ${peerUserId} negotiationneeded → creating offer`);
          await pc.setLocalDescription();
          if (!pc.localDescription) return;
          sendSignal(peerUserId, { kind: 'offer', sdp: pc.localDescription.sdp });
        } catch (err) {
          console.warn('[call] negotiation failed', err);
        } finally {
          rec.makingOffer = false;
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`[call] ${peerUserId} ICE: ${pc.iceConnectionState}`);
        if (pc.iceConnectionState === 'failed') {
          try {
            pc.restartIce();
          } catch {
            /* ignore */
          }
        }
      };

      pc.onconnectionstatechange = () => {
        console.log(`[call] ${peerUserId} connection: ${pc.connectionState}`);
      };

      pc.onsignalingstatechange = () => {
        console.log(`[call] ${peerUserId} signaling: ${pc.signalingState}`);
      };

      pcsRef.current.set(peerUserId, rec);
      return rec;
    },
    [rtcConfig, myUserId, sendSignal, attachAnalyser],
  );

  const closePeer = useCallback(
    (peerUserId: string): void => {
      const rec = pcsRef.current.get(peerUserId);
      if (!rec) return;
      try {
        rec.pc.close();
      } catch {
        /* ignore */
      }
      pcsRef.current.delete(peerUserId);
      detachAnalyser(peerUserId);
      setRemoteStreams((prev) => {
        if (!prev.has(peerUserId)) return prev;
        const next = new Map(prev);
        next.delete(peerUserId);
        return next;
      });
      // Clear any lingering speaking indicator — handles hard-disconnects
      // where the peer left while their last `call_speaking: true` was the
      // most recent broadcast.
      setSpeaking((prev) => {
        if (!prev.has(peerUserId)) return prev;
        const next = new Set(prev);
        next.delete(peerUserId);
        return next;
      });
    },
    [detachAnalyser],
  );

  const closeAllPeers = useCallback((): void => {
    for (const id of [...pcsRef.current.keys()]) closePeer(id);
  }, [closePeer]);

  // ── Incoming signal handling ────────────────────────────────────────────

  useEffect(() => {
    const off = callSignalBus.on(async (fromUserId, payload) => {
      if (stateRef.current !== 'in') return;
      let rec = pcsRef.current.get(fromUserId);
      if (!rec) {
        // We received signaling before we noticed the peer joined — create
        // the PC on the fly so the impolite peer's offer can land.
        try {
          rec = createPeer(fromUserId);
        } catch {
          return;
        }
      }
      const { pc, polite } = rec;
      try {
        if (payload.kind === 'offer') {
          const readyForOffer =
            !rec.makingOffer &&
            (pc.signalingState === 'stable' || rec.isSettingRemoteAnswer);
          const offerCollision = !readyForOffer;
          console.log(
            `[call] recv offer from ${fromUserId} state=${pc.signalingState} makingOffer=${rec.makingOffer} polite=${polite} collision=${offerCollision}`,
          );
          if (!polite && offerCollision) {
            console.log(`[call] glare with ${fromUserId}: impolite, ignoring`);
            return;
          }
          await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
          await pc.setLocalDescription();
          if (!pc.localDescription) return;
          sendSignal(fromUserId, { kind: 'answer', sdp: pc.localDescription.sdp });
          console.log(`[call] sent answer to ${fromUserId}`);
        } else if (payload.kind === 'answer') {
          console.log(`[call] recv answer from ${fromUserId} state=${pc.signalingState}`);
          rec.isSettingRemoteAnswer = true;
          await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
          rec.isSettingRemoteAnswer = false;
        } else if (payload.kind === 'ice') {
          try {
            await pc.addIceCandidate(payload.candidate ?? undefined);
          } catch (e) {
            // Ignore stale ICE after rollback; rethrow real issues.
            if (!rec.makingOffer) console.warn('[call] addIceCandidate', e);
          }
        }
      } catch (err) {
        console.warn('[call] signal handling failed', err);
      }
    });
    return off;
  }, [createPeer, sendSignal]);

  // ── Snapshot watcher: diff callMembers vs open PCs ──────────────────────

  useEffect(() => {
    if (state !== 'in' || !myUserId) return;
    const wantedPeers = new Set(
      callMembers.filter((m) => m.userId !== myUserId).map((m) => m.userId),
    );
    // Open missing PCs.
    for (const peerId of wantedPeers) {
      if (!pcsRef.current.has(peerId)) {
        try {
          createPeer(peerId);
        } catch (e) {
          console.warn('call:createPeer failed', e);
        }
      }
    }
    // Close PCs that no longer have a member.
    for (const peerId of [...pcsRef.current.keys()]) {
      if (!wantedPeers.has(peerId)) closePeer(peerId);
    }
  }, [callMembers, state, myUserId, createPeer, closePeer]);

  // ── WS reconnect re-init ────────────────────────────────────────────────

  const prevWsStateRef = useRef<WSConnectionState>(wsState);
  useEffect(() => {
    const prev = prevWsStateRef.current;
    prevWsStateRef.current = wsState;
    if (
      wsState === 'open' &&
      (prev === 'reconnecting' || prev === 'connecting' || prev === 'closed') &&
      stateRef.current === 'in'
    ) {
      // Old PCs are stale — start fresh and re-join.
      closeAllPeers();
      const wantVideo = !!localStreamRef.current?.getVideoTracks()[0]?.enabled;
      send({ t: 'call_join', wantVideo, clientTs: Date.now() });
    }
  }, [wsState, send, closeAllPeers]);

  // ── Outbound video sync (camera ⊕ mirror pipeline) ─────────────────────
  // Single source of truth for what video track every PC + outbound stream
  // currently has. Recomputes from `rawCameraTrackRef` and the current mirror
  // setting; performs `sender.replaceTrack` / `addTrack` / `removeTrack` to
  // reach the desired state. `join` / `toggleCamera` / `switchCamera` and
  // mirror-setting changes all funnel through here.

  const syncOutboundVideo = useCallback(async (): Promise<void> => {
    const outbound = outboundStreamRef.current;
    const local = localStreamRef.current;
    if (!outbound || !local) return;

    const rawTrack = rawCameraTrackRef.current;
    // На iOS canvas.captureStream() из detached <video> часто отдаёт чёрные
    // кадры в WebRTC — поэтому зеркало (канвас-пайплайн) там не используем,
    // шлём сырой трек камеры.
    const mirrorOn = useCallSettingsStore.getState().mirrorSelfVideo && !isIOS();

    // Ensure mirror pipeline matches desired state.
    if (mirrorOn && rawTrack) {
      if (!mirrorPipelineRef.current) {
        try {
          mirrorPipelineRef.current = startMirrorPipeline(rawTrack);
          console.log('[call] mirror pipeline built');
        } catch (err) {
          console.warn('[call] mirror pipeline build failed', err);
          mirrorPipelineRef.current = null;
        }
      }
    } else if (mirrorPipelineRef.current) {
      mirrorPipelineRef.current.teardown();
      mirrorPipelineRef.current = null;
      console.log('[call] mirror pipeline torn down');
    }

    // The track we *want* to send. Falls back to raw if the mirror pipeline
    // failed to start (e.g. canvas context unavailable).
    const desired: MediaStreamTrack | null = rawTrack
      ? (mirrorOn ? (mirrorPipelineRef.current?.outputTrack ?? rawTrack) : rawTrack)
      : null;
    const current = outbound.getVideoTracks()[0] ?? null;
    if (current === desired) return;

    // Камеру включаем/выключаем через replaceTrack по предсогласованному
    // sendrecv-отправителю — без addTrack/removeTrack, т.е. без второго
    // SDP-согласования. replaceTrack(null) гасит камеру, replaceTrack(track)
    // включает. Этот путь надёжен на iOS (фрагильный re-negotiation убран).
    for (const rec of pcsRef.current.values()) {
      const sender =
        rec.videoSender ?? rec.pc.getSenders().find((s) => s.track?.kind === 'video') ?? null;
      if (!sender) continue;
      try {
        await sender.replaceTrack(desired ?? null);
      } catch (err) {
        console.warn('[call] replaceTrack(video) failed', err);
      }
    }

    // Reconcile the outbound stream's video track.
    if (current) {
      try { outbound.removeTrack(current); } catch { /* ignore */ }
    }
    if (desired) outbound.addTrack(desired);

    // Self preview = what peers see. Audio in the preview comes from the
    // raw local stream (the `<video muted={isMe}>` mutes it anyway).
    const audioTrack = local.getAudioTracks()[0];
    const previewTracks: MediaStreamTrack[] = [];
    if (audioTrack) previewTracks.push(audioTrack);
    if (desired) previewTracks.push(desired);
    setMyStream(new MediaStream(previewTracks));
  }, []);

  // ── Public actions ──────────────────────────────────────────────────────

  const join = useCallback<UseCallApi['join']>(
    async ({ withVideo }) => {
      if (!myUserId || myUserKind !== 'user') {
        setPermissionError('denied');
        return;
      }
      if (stateRef.current !== 'idle') return;
      setState('connecting');
      setPermissionError(null);
      const { preferredMicId, preferredCameraId } = useCallSettingsStore.getState();
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints(preferredMicId),
          video: withVideo ? videoConstraints(preferredCameraId) : false,
        });
      } catch (err) {
        const name = (err as Error).name;
        setPermissionError(name === 'NotAllowedError' ? 'denied' : 'no-mic');
        setState('idle');
        return;
      }
      // Diagnostic: confirm what the browser actually applied vs what we asked
      // for (some platforms silently drop AGC/NS hints).
      const audioSettings = stream.getAudioTracks()[0]?.getSettings();
      console.log('[call] mic settings:', audioSettings);

      localStreamRef.current = stream;
      micOnRef.current = false;
      // Remember the raw camera track (if any) so `syncOutboundVideo` knows
      // it has something to build the mirror pipeline against.
      rawCameraTrackRef.current = stream.getVideoTracks()[0] ?? null;
      setMyStream(stream);

      const ctx = ensureAudioCtx();

      // Отправка сырого микрофона без WebAudio-обработки. Также путь по
      // умолчанию для iOS (см. ниже) и аварийный фолбэк, если RNNoise не
      // поднялся. Мьютим трек сразу — toggleMic включает его через .enabled.
      const useRawMic = (): void => {
        const fallbackAudio = stream.getAudioTracks()[0];
        if (fallbackAudio) fallbackAudio.enabled = false;
        outboundStreamRef.current = new MediaStream(fallbackAudio ? [fallbackAudio] : []);
        attachAnalyser(myUserId, stream);
      };

      // iOS/WebKit: трек из MediaStreamAudioDestinationNode уходит ТИШИНОЙ
      // через RTCPeerConnection (давний баг WebKit) — поэтому на iOS WebAudio-
      // пайплайн (RNNoise) в исходящем тракте обходим и шлём сырой микрофон.
      let pipeline: AudioPipeline | null = null;
      if (isIOS()) {
        console.log('[call] iOS → отправляем сырой микрофон (без WebAudio-пайплайна)');
        useRawMic();
      } else {
        // Build the RNNoise pipeline. If it fails (older browser, blocked WASM,
        // wasm fetch error), fall back to the raw mic — peers still hear us,
        // just without the extra noise suppression layer.
        try {
          pipeline = await setupAudioPipeline(ctx, stream);
          pipelineRef.current = pipeline;
          // Outbound starts with processed audio only. `syncOutboundVideo`
          // adds the video track (flipped or raw depending on mirror setting)
          // before we announce ourselves to peers.
          const outbound = new MediaStream([pipeline.outboundAudioTrack]);
          outboundStreamRef.current = outbound;
          // Self-analyser reuses the pipeline's analyser tap (post-gain), so
          // the speaking indicator goes silent the instant the mic mutes.
          // Keyed by `myUserId` so the same Set conveys both local and remote
          // speakers to the UI.
          analysersRef.current.set(myUserId, {
            source: null,
            analyser: pipeline.selfAnalyser,
            data: new Uint8Array(new ArrayBuffer(pipeline.selfAnalyser.fftSize)),
          });
          console.log('[call] RNNoise pipeline ready');
        } catch (err) {
          console.warn('[call] RNNoise pipeline failed, falling back to raw mic', err);
          useRawMic();
        }
      }

      // Wire camera + mirror state into the outbound stream before announcing
      // ourselves; the snapshot watcher uses outbound's tracks to build PCs.
      await syncOutboundVideo();

      useRoomStore.getState().setMyMedia({ audio: false, video: withVideo });
      send({ t: 'call_join', wantVideo: withVideo, clientTs: Date.now() });
      setState('in');
    },
    [myUserId, myUserKind, send, attachAnalyser, ensureAudioCtx, syncOutboundVideo],
  );

  const leave = useCallback<UseCallApi['leave']>(() => {
    if (stateRef.current === 'idle') return;
    send({ t: 'call_leave', clientTs: Date.now() });
    closeAllPeers();
    pipelineRef.current?.teardown();
    pipelineRef.current = null;
    mirrorPipelineRef.current?.teardown();
    mirrorPipelineRef.current = null;
    rawCameraTrackRef.current = null;
    const stream = localStreamRef.current;
    if (stream) {
      for (const t of stream.getTracks()) t.stop();
    }
    localStreamRef.current = null;
    outboundStreamRef.current = null;
    micOnRef.current = false;
    prevSelfSpeakingRef.current = false;
    for (const key of [...analysersRef.current.keys()]) detachAnalyser(key);
    setMyStream(null);
    setRemoteStreams(new Map());
    setSpeaking(new Set());
    useRoomStore.getState().setMyMedia({ audio: false, video: false });
    setState('idle');
  }, [send, closeAllPeers, detachAnalyser]);

  const toggleMic = useCallback<UseCallApi['toggleMic']>(() => {
    const next = !micOnRef.current;
    micOnRef.current = next;
    const pipeline = pipelineRef.current;
    if (pipeline) {
      pipeline.setMicEnabled(next);
    } else {
      // Fallback path: no RNNoise pipeline → flip the raw mic track directly.
      const stream = localStreamRef.current;
      const t = stream?.getAudioTracks()[0];
      if (t) t.enabled = next;
    }
    broadcastMyMedia();
  }, [broadcastMyMedia]);

  // ── Device enumeration ─────────────────────────────────────────────────
  // Labels in `enumerateDevices()` are empty strings until the user has
  // granted mic permission at least once; we enumerate after `state === 'in'`
  // and also subscribe to `devicechange` so plug/unplug updates the list.

  useEffect(() => {
    if (state !== 'in') {
      setAvailableDevices({ mics: [], cameras: [] });
      return;
    }
    let cancelled = false;
    const refresh = async (): Promise<void> => {
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        setAvailableDevices({
          mics: list.filter((d) => d.kind === 'audioinput'),
          cameras: list.filter((d) => d.kind === 'videoinput'),
        });
      } catch (err) {
        console.warn('[call] enumerateDevices failed', err);
      }
    };
    void refresh();
    const onChange = (): void => void refresh();
    navigator.mediaDevices.addEventListener('devicechange', onChange);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener('devicechange', onChange);
    };
  }, [state]);

  // Re-sync outbound video whenever the user toggles the mirror checkbox.
  // Inside the call only; outside it the pipeline isn't live.
  const mirrorSelfVideo = useCallSettingsStore((s) => s.mirrorSelfVideo);
  useEffect(() => {
    if (state !== 'in') return;
    void syncOutboundVideo();
  }, [mirrorSelfVideo, state, syncOutboundVideo]);

  // ── Device hot-swap ────────────────────────────────────────────────────

  const switchMic = useCallback<UseCallApi['switchMic']>(async (deviceId) => {
    if (stateRef.current !== 'in') return;
    const local = localStreamRef.current;
    if (!local) return;
    let newStream: MediaStream;
    try {
      // `exact` so the browser actually gives us the device the user picked,
      // not the original mic with a non-binding `ideal` hint.
      newStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints(deviceId, 'exact'),
      });
    } catch (err) {
      console.warn('[call] switchMic getUserMedia failed', err);
      return;
    }
    const newTrack = newStream.getAudioTracks()[0];
    if (!newTrack) return;
    const oldTrack = local.getAudioTracks()[0];

    const pipeline = pipelineRef.current;
    if (pipeline) {
      // Pipeline owns a MediaStreamSource — swap it so the post-RNNoise
      // outbound track stays the same id and peers see no renegotiation.
      pipeline.replaceMicStream(newStream);
    } else {
      // Fallback path (no pipeline): replace the audio track on every sender.
      newTrack.enabled = micOnRef.current;
      for (const rec of pcsRef.current.values()) {
        const sender = rec.pc.getSenders().find((s) => s.track?.kind === 'audio');
        if (sender) {
          try { await sender.replaceTrack(newTrack); }
          catch (err) { console.warn('[call] sender.replaceTrack(audio) failed', err); }
        }
      }
      const outbound = outboundStreamRef.current;
      if (outbound && oldTrack) {
        try { outbound.removeTrack(oldTrack); } catch { /* ignore */ }
        outbound.addTrack(newTrack);
      }
    }

    // Update localStream so the self view (which uses raw audio for analyser
    // fallback) reflects the new device. Then stop the old raw track.
    if (oldTrack) {
      try { local.removeTrack(oldTrack); } catch { /* ignore */ }
      try { oldTrack.stop(); } catch { /* ignore */ }
    }
    local.addTrack(newTrack);
    setMyStream(new MediaStream(local.getTracks()));
    useCallSettingsStore.getState().setPreferredMicId(deviceId);
    console.log('[call] switched mic to', deviceId);
  }, []);

  const switchCamera = useCallback<UseCallApi['switchCamera']>(async (deviceId) => {
    if (stateRef.current !== 'in') return;
    useCallSettingsStore.getState().setPreferredCameraId(deviceId);
    const local = localStreamRef.current;
    if (!local) return;
    // If camera is currently off, just remember the preference — it applies
    // the next time the user clicks "включить камеру".
    if (local.getVideoTracks().length === 0) return;

    let camStream: MediaStream;
    try {
      // `exact` so we *actually* get the device the user picked. `ideal` is
      // a non-binding hint and the browser frequently returns the original
      // camera instead.
      camStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints(deviceId, 'exact'),
      });
    } catch (err) {
      console.warn('[call] switchCamera getUserMedia failed', err);
      return;
    }
    const newTrack = camStream.getVideoTracks()[0];
    if (!newTrack) return;
    const newSettings = newTrack.getSettings();
    console.log('[call] switchCamera new track:', { deviceId: newSettings.deviceId, label: newTrack.label });

    const oldRawTrack = rawCameraTrackRef.current;

    // Tear down the old mirror pipeline so syncOutboundVideo rebuilds it
    // against the new raw track (the canvas's source binding is fixed).
    if (mirrorPipelineRef.current) {
      mirrorPipelineRef.current.teardown();
      mirrorPipelineRef.current = null;
    }

    // Swap the raw track in the local stream and stop the old one.
    if (oldRawTrack) {
      try { local.removeTrack(oldRawTrack); } catch { /* ignore */ }
      try { oldRawTrack.stop(); } catch { /* ignore */ }
    }
    local.addTrack(newTrack);
    rawCameraTrackRef.current = newTrack;

    await syncOutboundVideo();
  }, [syncOutboundVideo]);

  const toggleCamera = useCallback<UseCallApi['toggleCamera']>(async () => {
    const stream = localStreamRef.current;
    const outbound = outboundStreamRef.current;
    if (!stream || !outbound) return;
    const existing = rawCameraTrackRef.current;
    if (existing) {
      // Turn camera OFF: stop raw track, clear ref, let syncOutboundVideo
      // tear down the mirror pipeline + remove senders.
      try { stream.removeTrack(existing); } catch { /* ignore */ }
      try { existing.stop(); } catch { /* ignore */ }
      rawCameraTrackRef.current = null;
      await syncOutboundVideo();
      broadcastMyMedia();
      return;
    }
    const { preferredCameraId } = useCallSettingsStore.getState();
    let camStream: MediaStream;
    try {
      camStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints(preferredCameraId),
      });
    } catch {
      setPermissionError('denied');
      return;
    }
    const track = camStream.getVideoTracks()[0];
    if (!track) return;
    stream.addTrack(track);
    rawCameraTrackRef.current = track;
    // syncOutboundVideo builds the mirror pipeline (if mirror is on), wires
    // up the outbound stream, and adds the track to each PC.
    await syncOutboundVideo();
    broadcastMyMedia();
  }, [broadcastMyMedia, syncOutboundVideo]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      // Hook-level teardown. Avoid sending leave during route changes since the
      // server cleans us up on WS close anyway.
      closeAllPeers();
      pipelineRef.current?.teardown();
      pipelineRef.current = null;
      mirrorPipelineRef.current?.teardown();
      mirrorPipelineRef.current = null;
      rawCameraTrackRef.current = null;
      outboundStreamRef.current = null;
      micOnRef.current = false;
      const stream = localStreamRef.current;
      if (stream) for (const t of stream.getTracks()) t.stop();
      localStreamRef.current = null;
      for (const key of [...analysersRef.current.keys()]) detachAnalyser(key);
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => undefined);
      audioCtxRef.current = null;
    };
  }, [closeAllPeers, detachAnalyser]);

  return {
    state,
    permissionError,
    myStream,
    remoteStreams,
    speaking,
    availableDevices,
    join,
    leave,
    toggleMic,
    switchMic,
    switchCamera,
    toggleCamera,
  };
}
