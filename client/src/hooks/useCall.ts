import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  C2S,
  CallMember,
  CallSignalPayload,
  IceCandidatePayload,
  RtcConfig,
} from '@vellin/shared';
import { callSignalBus } from '../ws/callSignalBus';
import { useRoomStore } from '../stores/roomStore';
import type { WSConnectionState } from '../ws/WSClient';

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
  join: (opts: { withVideo: boolean }) => Promise<void>;
  leave: () => void;
  toggleMic: () => void;
  toggleCamera: () => Promise<void>;
}

interface PeerRecord {
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  isSettingRemoteAnswer: boolean;
}

interface AnalyserRecord {
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  data: Uint8Array<ArrayBuffer>;
}

const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 640 },
  height: { ideal: 360 },
  frameRate: { ideal: 24 },
};
const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};
const SPEAKING_THRESHOLD = 0.04;
const SPEAKING_LINGER_MS = 350;

export function useCall(opts: UseCallOpts): UseCallApi {
  const { myUserId, myUserKind, rtcConfig, callMembers, wsState, send } = opts;

  const [state, setState] = useState<CallState>('idle');
  const [permissionError, setPermissionError] = useState<PermissionError>(null);
  const [myStream, setMyStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());

  const pcsRef = useRef<Map<string, PeerRecord>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<Map<string, AnalyserRecord>>(new Map());
  const lastSpokeRef = useRef<Map<string, number>>(new Map());
  const rafRef = useRef<number | null>(null);
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
    const stream = localStreamRef.current;
    const audio = !!stream?.getAudioTracks()[0]?.enabled;
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
    try {
      rec.source.disconnect();
    } catch {
      /* ignore */
    }
    analysersRef.current.delete(key);
    lastSpokeRef.current.delete(key);
  }, []);

  // rAF loop measuring RMS for each analyser; updates `speaking` set.
  useEffect(() => {
    if (state !== 'in') return;
    let active = true;
    const tick = (): void => {
      if (!active) return;
      const now = performance.now();
      const next = new Set<string>();
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
        if (now - last < SPEAKING_LINGER_MS) next.add(key);
      }
      // Only update state when the set actually changed.
      setSpeaking((prev) => {
        if (prev.size === next.size && [...prev].every((id) => next.has(id))) return prev;
        return next;
      });
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      active = false;
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [state]);

  // ── Peer connection lifecycle ───────────────────────────────────────────

  const createPeer = useCallback(
    (peerUserId: string): PeerRecord => {
      if (!rtcConfig || !myUserId) throw new Error('useCall: missing rtcConfig / myUserId');
      const pc = new RTCPeerConnection({ iceServers: rtcConfig.iceServers as RTCIceServer[] });
      const polite = myUserId < peerUserId;
      const rec: PeerRecord = { pc, polite, makingOffer: false, isSettingRemoteAnswer: false };

      // addTrack is the simplest, most battle-tested pattern: it implicitly
      // creates a transceiver with the track attached, so the initial offer
      // SDP always correctly describes our local media.
      const local = localStreamRef.current;
      if (local) {
        for (const track of local.getTracks()) {
          try {
            pc.addTrack(track, local);
          } catch (err) {
            console.warn(`[call] ${peerUserId} addTrack(${track.kind}) failed`, err);
          }
        }
        console.log(
          `[call] createPeer ${peerUserId} polite=${polite} tracks=${local
            .getTracks()
            .map((t) => `${t.kind}:${t.enabled}`)
            .join(',')}`,
        );
      } else {
        console.warn(`[call] createPeer ${peerUserId}: no local stream — peer will be receive-only`);
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
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: AUDIO_CONSTRAINTS,
          video: withVideo ? VIDEO_CONSTRAINTS : false,
        });
      } catch (err) {
        const name = (err as Error).name;
        setPermissionError(name === 'NotAllowedError' ? 'denied' : 'no-mic');
        setState('idle');
        return;
      }
      const audio = stream.getAudioTracks()[0];
      if (audio) audio.enabled = false; // mic always starts muted
      localStreamRef.current = stream;
      setMyStream(stream);
      attachAnalyser('__self__', stream);
      useRoomStore.getState().setMyMedia({ audio: false, video: withVideo });
      send({ t: 'call_join', wantVideo: withVideo, clientTs: Date.now() });
      setState('in');
    },
    [myUserId, myUserKind, send, attachAnalyser],
  );

  const leave = useCallback<UseCallApi['leave']>(() => {
    if (stateRef.current === 'idle') return;
    send({ t: 'call_leave', clientTs: Date.now() });
    closeAllPeers();
    const stream = localStreamRef.current;
    if (stream) {
      for (const t of stream.getTracks()) t.stop();
    }
    localStreamRef.current = null;
    detachAnalyser('__self__');
    setMyStream(null);
    setRemoteStreams(new Map());
    setSpeaking(new Set());
    useRoomStore.getState().setMyMedia({ audio: false, video: false });
    setState('idle');
  }, [send, closeAllPeers, detachAnalyser]);

  const toggleMic = useCallback<UseCallApi['toggleMic']>(() => {
    const stream = localStreamRef.current;
    const t = stream?.getAudioTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    broadcastMyMedia();
  }, [broadcastMyMedia]);

  const toggleCamera = useCallback<UseCallApi['toggleCamera']>(async () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const existing = stream.getVideoTracks()[0];
    if (existing) {
      // Remove the camera: stop the track, drop the sender, trigger renegotiation.
      existing.stop();
      stream.removeTrack(existing);
      for (const rec of pcsRef.current.values()) {
        const sender = rec.pc.getSenders().find((s) => s.track === existing);
        if (sender) {
          try {
            rec.pc.removeTrack(sender);
          } catch (err) {
            console.warn('[call] removeTrack failed', err);
          }
        }
      }
      setMyStream(new MediaStream(stream.getTracks()));
      broadcastMyMedia();
      return;
    }
    let camStream: MediaStream;
    try {
      camStream = await navigator.mediaDevices.getUserMedia({ video: VIDEO_CONSTRAINTS });
    } catch {
      setPermissionError('denied');
      return;
    }
    const track = camStream.getVideoTracks()[0];
    if (!track) return;
    stream.addTrack(track);
    // addTrack on each PC creates a new sender + transceiver and fires
    // onnegotiationneeded — perfect-negotiation will exchange the new SDP.
    for (const rec of pcsRef.current.values()) {
      try {
        rec.pc.addTrack(track, stream);
      } catch (err) {
        console.warn('[call] addTrack(video) failed', err);
      }
    }
    setMyStream(new MediaStream(stream.getTracks()));
    broadcastMyMedia();
  }, [broadcastMyMedia]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      // Hook-level teardown. Avoid sending leave during route changes since the
      // server cleans us up on WS close anyway.
      closeAllPeers();
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
    join,
    leave,
    toggleMic,
    toggleCamera,
  };
}
