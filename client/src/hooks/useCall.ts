import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CallMember,
  CallSignalPayload,
  IceCandidatePayload,
  RtcConfig,
} from '@vellin/shared';
import { useCallSettingsStore } from '../stores/callSettingsStore';
import type { WSConnectionState } from '../ws/WSClient';
import { setupAudioPipeline, type AudioPipeline } from './audioPipeline';
import { startMirrorPipeline, type VideoMirrorPipeline } from './videoMirror';
import {
  saveScreenOptions,
  screenMaxBitrate,
  screenVideoConstraints,
  type ScreenShareOptions,
  type ScreenSurface,
} from './screenShare';
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

/**
 * Как хук общается с сервером. Комната шлёт свои `C2S`, личные звонки — свои
 * сообщения пользовательского канала; механика согласования одна и та же,
 * поэтому она знает только эти пять действий.
 */
export interface CallTransport {
  join(wantVideo: boolean): void;
  leave(): void;
  signal(toUserId: string, payload: CallSignalPayload): void;
  /**
   * Своё состояние. `screen` — идущая демонстрация с приметами её дорожки
   * (null — демонстрации нет); комната демонстрацию не ведёт и его не читает.
   */
  media(audio: boolean, video: boolean, screen?: ScreenTrackHint | null): void;
  speaking(speaking: boolean): void;
}

/** Шина входящих сигналов — своя у комнаты и у каждого личного звонка. */
export interface CallSignalBus {
  on(listener: (fromUserId: string, payload: CallSignalPayload) => void): () => void;
}

/** Шина индикаторов речи. */
export interface CallSpeakingBus {
  on(listener: (userId: string, speaking: boolean) => void): () => void;
}

export interface UseCallOpts {
  myUserId: string | null;
  myUserKind: 'user' | 'guest' | null;
  rtcConfig: RtcConfig | null;
  callMembers: CallMember[];
  wsState: WSConnectionState;
  transport: CallTransport;
  signalBus: CallSignalBus;
  speakingBus: CallSpeakingBus;
  /** Своё состояние микрофона/камеры — куда его класть, решает вызывающий. */
  onLocalMedia: (media: { audio: boolean; video: boolean }) => void;
}

/**
 * Ключ потока собеседника в `remoteStreams`: камера лежит под самим `userId`,
 * демонстрация экрана — под `userId:screen`. Демонстрация не заменяет камеру,
 * поэтому у одного человека потоков может быть два.
 */
export const SCREEN_KEY_SUFFIX = ':screen';
export const screenKey = (userId: string): string => `${userId}${SCREEN_KEY_SUFFIX}`;
/** Кому принадлежит поток — из ключа любого вида. */
export const ownerOfStreamKey = (key: string): string => key.split(':')[0] ?? key;

/**
 * Приметы дорожки демонстрации, присланные её ведущим: идентификатор линии в
 * согласовании и идентификатор потока. Двух примет нужно две, потому что на
 * Windows первая доезжает не всегда.
 */
export interface ScreenTrackHint {
  mid?: string;
  streamId?: string;
}

/** Идущая своя демонстрация экрана. */
export interface ActiveScreenShare {
  /** Захват — им рисуется своё превью. */
  stream: MediaStream;
  surface: ScreenSurface;
  options: ScreenShareOptions;
  /** Звук удалось захватить (браузер мог его не дать). */
  hasAudio: boolean;
  /** Что показывается — как назвал источник браузер. */
  label: string;
}

/** Чем кончилась попытка начать или изменить демонстрацию. */
export type ScreenShareResult = 'ok' | 'no-audio' | 'cancelled' | 'failed';

export interface UseCallApi {
  state: CallState;
  permissionError: PermissionError;
  myStream: MediaStream | null;
  /** Включён ли свой микрофон — по самому тракту, а не по флагу дорожки. */
  micOn: boolean;
  /** Состояние соединения с каждым собеседником. */
  linkStates: Map<string, RTCPeerConnectionState>;
  /** Статистика соединения с собеседником — по ней судят о качестве связи. */
  getStats: (peerUserId: string) => Promise<RTCStatsReport | null>;
  /** Своя демонстрация экрана, null — не идёт. */
  screenShare: ActiveScreenShare | null;
  startScreenShare: (surface: ScreenSurface, options: ScreenShareOptions) => Promise<ScreenShareResult>;
  /** Изменить идущую демонстрацию, не прерывая её у собеседника. */
  updateScreenShare: (surface: ScreenSurface, options: ScreenShareOptions) => Promise<ScreenShareResult>;
  stopScreenShare: () => void;
  /**
   * Начать проверку микрофона: собеседник на это время вас не слышит, а
   * возвращённый поток — ваш голос после всей обработки, как его слышат.
   * null — проверять нечего (вы не в звонке).
   */
  startMicCheck: () => MediaStream | null;
  /** Закончить проверку и вернуть микрофон собеседнику, если он был включён. */
  stopMicCheck: () => void;
  remoteStreams: Map<string, MediaStream>;
  /** Сообщить, какая дорожка собеседника — демонстрация экрана (null — её нет). */
  setScreenHint: (userId: string, hint: ScreenTrackHint | null) => void;
  speaking: Set<string>;
  /** Latest enumerateDevices snapshot — populated once the mic permission is granted. */
  availableDevices: { mics: MediaDeviceInfo[]; cameras: MediaDeviceInfo[] };
  /** `micOn` — начать с включённым микрофоном (личный звонок); в комнате он выключен. */
  join: (opts: { withVideo: boolean; micOn?: boolean }) => Promise<void>;
  leave: () => void;
  toggleMic: () => void;
  /** Возвращает, включена ли камера в итоге: включение может не удаться. */
  toggleCamera: () => Promise<boolean>;
  /** Switch the active mic without renegotiating SDP (pipeline-internal swap). */
  switchMic: (deviceId: string) => Promise<void>;
  /** Switch the active camera without renegotiating SDP (`sender.replaceTrack`). */
  switchCamera: (deviceId: string) => Promise<void>;
}

/** Входящий поток и приметы, по которым его можно опознать. */
interface InboundStream {
  mid: string | null;
  streamId: string;
  stream: MediaStream;
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
  /**
   * Линии демонстрации. После остановки остаются в соединении пустыми:
   * повторный запуск — подмена дорожки, без нового согласования.
   */
  screenVideoSender: RTCRtpSender | null;
  screenAudioSender: RTCRtpSender | null;
  /**
   * Кандидаты ICE, пришедшие раньше описания собеседника. Применить их можно
   * только после него — иначе браузер их отвергает, и при встречном
   * согласовании обе стороны теряли кандидатов: связь не поднималась вовсе.
   */
  pendingCandidates: (RTCIceCandidateInit | null)[];
  /** Сторож соединения — см. `watchLink` в `createPeer`. */
  watchdog: number | null;
}

/**
 * Сколько ждать, прежде чем перезапустить поиск пути между собеседниками.
 * Проверка путей ещё не началась — значит, у одной из сторон нет кандидатов
 * (так бывает после встречного согласования: откат своего предложения
 * останавливает их сбор, и браузер его не возобновляет). Идёт, но затянулась —
 * путь не находится. Связь была и пропала — сеть сменилась или моргнула.
 */
const ICE_NEW_TIMEOUT_MS = 3000;
const ICE_CHECKING_TIMEOUT_MS = 10_000;
const ICE_LOST_TIMEOUT_MS = 4000;
const ICE_RESTART_LIMIT = 5;
/**
 * Своё предложение без ответа дольше этого — откатываем и предлагаем заново.
 * Ответ мог потеряться: собеседник как раз пересоздавал соединение, и наше
 * предложение пришло ему в никуда, а его встречное мы как невежливая сторона
 * отклоняем. Без повтора обе стороны ждали друг друга вечно.
 */
const OFFER_ANSWER_TIMEOUT_MS = 5000;

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
  channelCount: 1,
  sampleRate: 48000,
};

function audioConstraints(deviceId: string | null, mode: 'ideal' | 'exact' = 'ideal'): MediaTrackConstraints {
  // Обработка звука берётся из настроек: её выключение видно только при
  // захвате, поменять её у уже работающей дорожки нельзя.
  const { noiseSuppression, echoCancellation, autoGainControl } = useCallSettingsStore.getState();
  const base: MediaTrackConstraints = {
    ...AUDIO_CONSTRAINTS_BASE,
    echoCancellation,
    noiseSuppression,
    autoGainControl,
  };
  // `ideal` on initial join → graceful fallback if the previously chosen device
  // is unplugged. `exact` on explicit switch → guarantee we get the device the
  // user just picked (otherwise the browser ignores the hint).
  return deviceId ? { ...base, deviceId: { [mode]: deviceId } as ConstrainDOMString } : base;
}

function videoConstraints(deviceId: string | null, mode: 'ideal' | 'exact' = 'ideal'): MediaTrackConstraints {
  return deviceId
    ? { ...VIDEO_CONSTRAINTS_BASE, deviceId: { [mode]: deviceId } as ConstrainDOMString }
    : VIDEO_CONSTRAINTS_BASE;
}
const SPEAKING_THRESHOLD = 0.04;
const SPEAKING_LINGER_MS = 350;

export function useCall(opts: UseCallOpts): UseCallApi {
  const {
    myUserId,
    myUserKind,
    rtcConfig,
    callMembers,
    wsState,
    transport,
    signalBus,
    speakingBus,
    onLocalMedia,
  } = opts;

  const [state, setState] = useState<CallState>('idle');
  const [permissionError, setPermissionError] = useState<PermissionError>(null);
  const [myStream, setMyStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  // Все входящие потоки с их приметами и присланные подсказки о демонстрации.
  // Хранятся врозь, потому что дорожка и подсказка приходят разными путями и в
  // любом порядке: раскладка пересобирается из них при каждом изменении.
  const inboundRef = useRef<Map<string, InboundStream[]>>(new Map());
  const screenHintsRef = useRef<Map<string, ScreenTrackHint>>(new Map());
  // Все приметы, которые когда-либо называли демонстрацией. Линия демонстрации
  // переживает её остановку (дорожка в ней просто гаснет), и без этой памяти
  // после снятия подсказки поток экрана записывался бы на место камеры.
  const knownScreenRef = useRef<Map<string, { mids: Set<string>; streamIds: Set<string> }>>(
    new Map(),
  );
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [micOn, setMicOn] = useState(false);
  const [linkStates, setLinkStates] = useState<Map<string, RTCPeerConnectionState>>(new Map());
  const [screenShare, setScreenShareState] = useState<ActiveScreenShare | null>(null);
  const screenShareRef = useRef<ActiveScreenShare | null>(null);
  // Поток-контейнер, в котором уходят дорожки демонстрации. Один на весь
  // звонок: его идентификатор — примета демонстрации для собеседника, и при
  // смене источника она не должна меняться.
  const screenOutRef = useRef<MediaStream | null>(null);
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
  // Signals that arrived while we were still joining — replayed on entry.
  const pendingSignalsRef = useRef<{ fromUserId: string; payload: CallSignalPayload }[]>([]);
  const pendingJoinRef = useRef<{ withVideo: boolean; micOn: boolean } | null>(null);
  // Сигналы одного собеседника обрабатываются строго по очереди: описание,
  // затем его кандидаты. Параллельная обработка давала гонку — кандидат
  // применялся, пока описание ещё ставилось, и терялся.
  const signalChainsRef = useRef<Map<string, Promise<void>>>(new Map());

  // ── Signaling envelope helpers ──────────────────────────────────────────

  const sendSignal = useCallback(
    (toUserId: string, payload: CallSignalPayload): void => {
      transport.signal(toUserId, payload);
    },
    [transport],
  );

  /**
   * Приметы своей демонстрации: номер линии в согласовании и идентификатор
   * потока-контейнера. Номер линии появляется только после согласования.
   */
  const screenMarks = useCallback((): ScreenTrackHint | null => {
    if (!screenShareRef.current) return null;
    let mid: string | undefined;
    for (const rec of pcsRef.current.values()) {
      const t = rec.pc.getTransceivers().find((x) => x.sender === rec.screenVideoSender);
      if (t?.mid) {
        mid = t.mid;
        break;
      }
    }
    const streamId = screenOutRef.current?.id;
    return { ...(mid ? { mid } : {}), ...(streamId ? { streamId } : {}) };
  }, []);

  const broadcastMyMedia = useCallback((): void => {
    // Authoritative source for mic state is the GainNode ref (track.enabled
    // doesn't reflect the post-RNNoise mute when the pipeline is active).
    const stream = localStreamRef.current;
    const audio = micOnRef.current;
    const video = !!stream?.getVideoTracks()[0]?.enabled;
    onLocalMedia({ audio, video });
    // Состояние уходит целиком — с демонстрацией и её приметами, — чтобы у
    // собеседника не разъехалась картина, что бы из этого ни переключалось.
    transport.media(audio, video, screenMarks());
  }, [transport, onLocalMedia, screenMarks]);

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
        transport.speaking(selfActive);
      }

      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      active = false;
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [state, myUserId, transport]);

  // Remote speaker indicators come over WS via `callSpeakingBus`. Merge them
  // into the same `speaking` set the local analyser writes to.
  useEffect(() => {
    return speakingBus.on((peerUserId, speaking) => {
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

  // ── Раскладка входящих потоков ──────────────────────────────────────────

  /**
   * Пересобрать `remoteStreams` из накопленных потоков и подсказок.
   *
   * Дорожка и подсказка о ней приходят разными путями — по соединению и по
   * сигнальному каналу — и в любом порядке. Поэтому раскладка не решается «на
   * месте» в момент прихода дорожки, а каждый раз выводится заново из обоих
   * источников: тогда поздняя подсказка сама переставит поток в демонстрацию.
   */
  const rebuildRemoteStreams = useCallback((): void => {
    const next = new Map<string, MediaStream>();
    for (const [userId, entries] of inboundRef.current) {
      const known = knownScreenRef.current.get(userId);
      for (const e of entries) {
        const isScreen =
          !!known &&
          ((!!e.mid && known.mids.has(e.mid)) || known.streamIds.has(e.streamId));
        // Камера не перезаписывается потоком неизвестного назначения: пустая
        // линия демонстрации, о которой ещё не сказали, не вытесняет лицо.
        const key = isScreen ? screenKey(userId) : userId;
        if (!isScreen && next.has(key) && !e.stream.getVideoTracks().some((t) => !t.muted)) continue;
        next.set(key, e.stream);
      }
    }
    setRemoteStreams((prev) => {
      if (prev.size === next.size && [...next].every(([k, v]) => prev.get(k) === v)) return prev;
      return next;
    });
  }, []);

  const setScreenHint = useCallback(
    (userId: string, hint: ScreenTrackHint | null): void => {
      if (hint && (hint.mid || hint.streamId)) {
        screenHintsRef.current.set(userId, hint);
        const known = knownScreenRef.current.get(userId) ?? { mids: new Set(), streamIds: new Set() };
        if (hint.mid) known.mids.add(hint.mid);
        if (hint.streamId) known.streamIds.add(hint.streamId);
        knownScreenRef.current.set(userId, known);
      } else {
        screenHintsRef.current.delete(userId);
      }
      rebuildRemoteStreams();
    },
    [rebuildRemoteStreams],
  );

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
        screenVideoSender: null,
        screenAudioSender: null,
        pendingCandidates: [],
        watchdog: null,
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

      // Соединение пересоздано посреди демонстрации (собеседник перезашёл) —
      // она должна продолжиться и в новом.
      const share = screenShareRef.current;
      const screenOut = screenOutRef.current;
      if (share && screenOut) {
        const v = share.stream.getVideoTracks()[0];
        const a = share.stream.getAudioTracks()[0];
        if (v) rec.screenVideoSender = pc.addTrack(v, screenOut);
        if (a) rec.screenAudioSender = pc.addTrack(a, screenOut);
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
        // Потоков от одного человека может быть два — камера и демонстрация.
        // Копим их все, а кто из них кто — решает раскладка по подсказкам.
        const entries = inboundRef.current.get(peerUserId) ?? [];
        const mid = ev.transceiver?.mid ?? null;
        const known = entries.find((e) => e.stream === stream);
        if (known) known.mid = known.mid ?? mid;
        else entries.push({ mid, streamId: stream.id, stream });
        inboundRef.current.set(peerUserId, entries);
        rebuildRemoteStreams();
        // NB: do NOT attach a Web Audio analyser to a remote PeerConnection
        // stream — Chrome silently mutes the <audio> playback for that stream
        // once a MediaStreamAudioSourceNode owns it. Active-speaker indicator
        // for remote peers is intentionally left for a future getStats() pass.
      };

      // Первое предложение делает невежливая сторона. Если начнут обе сразу,
      // вежливой придётся откатить своё, а откат во время сбора кандидатов
      // оставляет её без кандидатов навсегда (так ведёт себя Chrome) — связь
      // не поднимается вовсе. Вежливая ждёт чужое предложение и начинает
      // сама, только если его так и не пришло: собеседник может быть давно в
      // звонке и сам ничего не начнёт.
      let politeWait: number | null = null;
      let politeMayOffer = false;
      const POLITE_FIRST_OFFER_WAIT_MS = 2500;

      pc.onnegotiationneeded = async () => {
        if (polite && !politeMayOffer && !pc.remoteDescription && pc.signalingState === 'stable') {
          if (politeWait !== null) return;
          politeWait = window.setTimeout(() => {
            politeWait = null;
            if (pc.signalingState !== 'stable' || pc.remoteDescription) return;
            politeMayOffer = true;
            console.log(`[call] ${peerUserId} предложения не пришло — начинаем сами`);
            pc.onnegotiationneeded?.(new Event('negotiationneeded'));
          }, POLITE_FIRST_OFFER_WAIT_MS);
          return;
        }
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
        // Закрытое соединение уже убрано из списка — его состояние не пишем,
        // иначе оно воскресло бы в карте после closePeer.
        if (pcsRef.current.get(peerUserId)?.pc !== pc) return;
        setLinkStates((prev) => {
          if (prev.get(peerUserId) === pc.connectionState) return prev;
          const next = new Map(prev);
          next.set(peerUserId, pc.connectionState);
          return next;
        });
      };

      pc.onsignalingstatechange = () => {
        console.log(`[call] ${peerUserId} signaling: ${pc.signalingState}`);
      };

      // Сторож соединения. Перезапуск делает только одна сторона — невежливая:
      // если начнут обе, получится новое встречное согласование.
      let stateSince = performance.now();
      let lastState: RTCIceConnectionState = pc.iceConnectionState;
      let restarts = 0;
      let offerSince = 0;
      let reoffers = 0;
      rec.watchdog = window.setInterval(() => {
        const ice = pc.iceConnectionState;
        if (pc.signalingState === 'closed') return;
        if (pc.signalingState === 'have-local-offer') {
          if (offerSince === 0) offerSince = performance.now();
          if (!polite && reoffers < ICE_RESTART_LIMIT && performance.now() - offerSince > OFFER_ANSWER_TIMEOUT_MS) {
            reoffers++;
            offerSince = 0;
            console.log(`[call] ${peerUserId} ответа на предложение нет — предлагаем заново (${reoffers})`);
            void pc
              .setLocalDescription({ type: 'rollback' })
              // Заново — с новым сбором кандидатов: откат во время сбора мог его
              // остановить, и прежние учётные данные остались бы без кандидатов.
              .then(() => pc.restartIce())
              .catch(() => undefined);
          }
          return;
        }
        offerSince = 0;
        if (ice !== lastState) {
          lastState = ice;
          stateSince = performance.now();
        }
        if (ice === 'connected' || ice === 'completed') {
          restarts = 0;
          return;
        }
        if (polite || pc.signalingState !== 'stable' || restarts >= ICE_RESTART_LIMIT) return;
        const waited = performance.now() - stateSince;
        const limit =
          ice === 'new'
            ? ICE_NEW_TIMEOUT_MS
            : ice === 'checking'
              ? ICE_CHECKING_TIMEOUT_MS
              : ICE_LOST_TIMEOUT_MS;
        if (waited < limit) return;
        restarts++;
        stateSince = performance.now();
        console.log(`[call] ${peerUserId} ICE ${ice} ${Math.round(waited)} мс — перезапуск (${restarts})`);
        try {
          pc.restartIce();
        } catch {
          /* соединение уже закрыто */
        }
      }, 1000);

      pcsRef.current.set(peerUserId, rec);
      return rec;
    },
    [rtcConfig, myUserId, sendSignal, attachAnalyser],
  );

  const closePeer = useCallback(
    (peerUserId: string): void => {
      const rec = pcsRef.current.get(peerUserId);
      if (!rec) return;
      if (rec.watchdog !== null) window.clearInterval(rec.watchdog);
      try {
        rec.pc.close();
      } catch {
        /* ignore */
      }
      pcsRef.current.delete(peerUserId);
      detachAnalyser(peerUserId);
      // Уходят оба потока — и камера, и демонстрация.
      inboundRef.current.delete(peerUserId);
      screenHintsRef.current.delete(peerUserId);
      // Память о приметах демонстрации остаётся до конца звонка: собеседник,
      // перезашедший посреди неё, шлёт тот же поток, а повторной подсказки
      // может и не прислать.
      rebuildRemoteStreams();
      setLinkStates((prev) => {
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
    [detachAnalyser, rebuildRemoteStreams],
  );

  const closeAllPeers = useCallback((): void => {
    for (const id of [...pcsRef.current.keys()]) closePeer(id);
  }, [closePeer]);

  // ── Incoming signal handling ────────────────────────────────────────────

  const handleSignal = useCallback(
    async (fromUserId: string, payload: CallSignalPayload): Promise<void> => {
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
      // Описание собеседника встало — теперь можно применить кандидатов,
      // которые пришли раньше него.
      const flushCandidates = async (): Promise<void> => {
        const queued = rec.pendingCandidates.splice(0);
        for (const c of queued) {
          try {
            await pc.addIceCandidate(c ?? undefined);
          } catch {
            // Кандидат от отвергнутого встречного предложения — не нужен.
          }
        }
      };
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
          await flushCandidates();
          await pc.setLocalDescription();
          if (!pc.localDescription) return;
          sendSignal(fromUserId, { kind: 'answer', sdp: pc.localDescription.sdp });
          console.log(`[call] sent answer to ${fromUserId}`);
        } else if (payload.kind === 'answer') {
          console.log(`[call] recv answer from ${fromUserId} state=${pc.signalingState}`);
          rec.isSettingRemoteAnswer = true;
          await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
          rec.isSettingRemoteAnswer = false;
          await flushCandidates();
        } else if (payload.kind === 'ice') {
          if (!pc.remoteDescription) {
            if (rec.pendingCandidates.length < 200) rec.pendingCandidates.push(payload.candidate ?? null);
            return;
          }
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
    },
    [createPeer, sendSignal],
  );

  useEffect(() => {
    const off = signalBus.on(async (fromUserId, payload) => {
      // Entering a call takes a moment — mic permission, the noise pipeline,
      // the camera. A peer that got ready first signals into that gap, and
      // dropping its offer here deadlocks negotiation: the impolite side waits
      // for an answer that never comes, so neither audio nor video ever flows.
      // Hold early signals and replay them once we are in.
      if (stateRef.current !== 'in') {
        if (pendingSignalsRef.current.length < 64) {
          pendingSignalsRef.current.push({ fromUserId, payload });
        }
        return;
      }
      const chains = signalChainsRef.current;
      const next = (chains.get(fromUserId) ?? Promise.resolve())
        .then(() => handleSignal(fromUserId, payload))
        .catch(() => undefined);
      chains.set(fromUserId, next);
      await next;
    });
    return off;
  }, [handleSignal]);

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
      transport.join(wantVideo);
    }
  }, [wsState, transport, closeAllPeers]);

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
    async ({ withVideo, micOn: startMicOn = false }) => {
      // Кто вошёл, комната сообщает не сразу. Нажатие «войти в звонок» до этого
      // раньше сразу показывало «нет доступа к микрофону», хотя доступ есть, —
      // теперь оно ждёт и выполняется, как только пользователь известен.
      if (!myUserId || myUserKind === null) {
        if (stateRef.current !== 'idle') return;
        pendingJoinRef.current = { withVideo, micOn: startMicOn };
        stateRef.current = 'connecting';
        setState('connecting');
        return;
      }
      if (myUserKind !== 'user') {
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
          pipeline.setDenoiseEnabled(useCallSettingsStore.getState().noiseSuppression);
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

      // Личный звонок начинается с включённым микрофоном — как в приложении:
      // ответив, человек сразу говорит. В комнате микрофон включают сами.
      if (startMicOn) {
        micOnRef.current = true;
        if (pipeline) pipeline.setMicEnabled(true);
        else {
          const t = stream.getAudioTracks()[0];
          if (t) t.enabled = true;
        }
      }
      setMicOn(micOnRef.current);

      onLocalMedia({ audio: micOnRef.current, video: withVideo });
      transport.join(withVideo);
      setState('in');
      // React applies the state on the next render, but the queued signals
      // must be handled now — the peer is already waiting for our answer.
      stateRef.current = 'in';
      const queued = pendingSignalsRef.current;
      pendingSignalsRef.current = [];
      for (const s of queued) await handleSignal(s.fromUserId, s.payload);
    },
    [
      myUserId,
      myUserKind,
      transport,
      onLocalMedia,
      attachAnalyser,
      ensureAudioCtx,
      syncOutboundVideo,
      handleSignal,
    ],
  );

  // Отложенный вход в звонок — пользователь стал известен.
  useEffect(() => {
    const pending = pendingJoinRef.current;
    if (!pending || !myUserId || myUserKind === null) return;
    pendingJoinRef.current = null;
    stateRef.current = 'idle';
    void join(pending);
  }, [myUserId, myUserKind, join]);

  const leave = useCallback<UseCallApi['leave']>(() => {
    if (pendingJoinRef.current) {
      // Вход ещё только ждал пользователя — отменить его достаточно.
      pendingJoinRef.current = null;
      stateRef.current = 'idle';
      setState('idle');
      return;
    }
    if (stateRef.current === 'idle') return;
    // Проверка микрофона кончается вместе со звонком.
    micCheckRef.current?.clone?.stop();
    micCheckRef.current = null;
    transport.leave();
    pendingSignalsRef.current = [];
    // Демонстрация гаснет вместе со звонком — иначе браузер так и держал бы
    // захват экрана с плашкой «вы показываете этот экран».
    const share = screenShareRef.current;
    if (share) {
      for (const t of share.stream.getTracks()) {
        t.onended = null;
        t.stop();
      }
    }
    screenShareRef.current = null;
    setScreenShareState(null);
    screenOutRef.current = null;
    knownScreenRef.current.clear();
    setMicOn(false);
    closeAllPeers();
    setLinkStates(new Map());
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
    inboundRef.current.clear();
    screenHintsRef.current.clear();
    setRemoteStreams(new Map());
    setSpeaking(new Set());
    onLocalMedia({ audio: false, video: false });
    setState('idle');
  }, [transport, onLocalMedia, closeAllPeers, detachAnalyser]);

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
    setMicOn(next);
    broadcastMyMedia();
  }, [broadcastMyMedia]);

  // ── Проверка микрофона ─────────────────────────────────────────────────

  /**
   * Идущая проверка: был ли микрофон включён до неё (чтобы вернуть) и копия
   * дорожки — для пути без обработки, где отвода у тракта нет.
   */
  const micCheckRef = useRef<{ restoreMic: boolean; stream: MediaStream; clone: MediaStreamTrack | null } | null>(
    null,
  );

  const startMicCheck = useCallback<UseCallApi['startMicCheck']>(() => {
    if (stateRef.current !== 'in') return null;
    if (micCheckRef.current) return micCheckRef.current.stream;
    // Собеседник на время проверки вас не слышит — и видит это как обычное
    // выключение микрофона.
    const restoreMic = micOnRef.current;
    if (restoreMic) toggleMic();

    const pipeline = pipelineRef.current;
    let stream: MediaStream;
    let clone: MediaStreamTrack | null = null;
    if (pipeline) {
      stream = pipeline.startMonitor();
    } else {
      // Без своего тракта (iOS, сбой шумодава) обработку делает сам браузер —
      // её несёт дорожка, а копия слышна и тогда, когда для звонка она выключена.
      const raw = localStreamRef.current?.getAudioTracks()[0];
      if (!raw) return null;
      clone = raw.clone();
      clone.enabled = true;
      stream = new MediaStream([clone]);
    }
    micCheckRef.current = { restoreMic, stream, clone };
    return stream;
  }, [toggleMic]);

  const stopMicCheck = useCallback<UseCallApi['stopMicCheck']>(() => {
    const check = micCheckRef.current;
    if (!check) return;
    micCheckRef.current = null;
    pipelineRef.current?.stopMonitor();
    check.clone?.stop();
    // Вернуть собеседнику микрофон, если он был включён, — и только если его
    // за время проверки не включили вручную.
    if (check.restoreMic && !micOnRef.current && stateRef.current === 'in') toggleMic();
  }, [toggleMic]);

  // ── Демонстрация экрана ────────────────────────────────────────────────

  /** Потолок битрейта и частоты: без него крупная картинка съедает канал. */
  const limitScreenSending = useCallback(async (options: ScreenShareOptions): Promise<void> => {
    for (const rec of pcsRef.current.values()) {
      const sender = rec.screenVideoSender;
      if (!sender) continue;
      try {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
        for (const e of params.encodings) {
          e.maxBitrate = screenMaxBitrate(options);
          e.maxFramerate = options.fps;
        }
        await sender.setParameters(params);
      } catch {
        /* ограничить не вышло — демонстрация пойдёт как есть */
      }
    }
  }, []);

  /** Положить дорожки захвата в линии демонстрации каждого соединения. */
  const attachScreenTracks = useCallback(async (capture: MediaStream | null): Promise<void> => {
    const video = capture?.getVideoTracks()[0] ?? null;
    const audio = capture?.getAudioTracks()[0] ?? null;
    let out = screenOutRef.current;
    if (!out && capture) {
      out = new MediaStream();
      screenOutRef.current = out;
    }
    if (out) {
      for (const t of out.getTracks()) out.removeTrack(t);
      if (video) out.addTrack(video);
      if (audio) out.addTrack(audio);
    }
    for (const rec of pcsRef.current.values()) {
      // Есть линия — подменяем дорожку в ней, без нового согласования. Нет —
      // добавляем: браузер сам попросит согласование.
      if (rec.screenVideoSender) {
        await rec.screenVideoSender.replaceTrack(video).catch(() => undefined);
      } else if (video && out) {
        rec.screenVideoSender = rec.pc.addTrack(video, out);
      }
      if (rec.screenAudioSender) {
        await rec.screenAudioSender.replaceTrack(audio).catch(() => undefined);
      } else if (audio && out) {
        rec.screenAudioSender = rec.pc.addTrack(audio, out);
      }
    }
  }, []);

  /**
   * Дождаться номера линии демонстрации: он появляется только после
   * согласования, а без него приложение для Windows не всегда узнаёт поток.
   */
  const waitScreenMid = useCallback(async (): Promise<void> => {
    const started = performance.now();
    while (performance.now() - started < 4000) {
      const marks = screenMarks();
      if (!marks || marks.mid || pcsRef.current.size === 0) return;
      await new Promise((r) => window.setTimeout(r, 120));
    }
  }, [screenMarks]);

  /** Захватить экран через системное окно браузера. */
  const captureScreen = useCallback(
    async (surface: ScreenSurface, options: ScreenShareOptions): Promise<MediaStream | 'cancelled' | 'failed'> => {
      const constraints = {
        video: { ...screenVideoConstraints(options), displaySurface: surface },
        audio: options.withAudio
          ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
          : false,
        // Подсказки системному окну: свою вкладку не предлагать, звук системы
        // при показе экрана — разрешить, переключать источник на ходу — тоже.
        selfBrowserSurface: 'exclude',
        systemAudio: 'include',
        surfaceSwitching: 'include',
      } as DisplayMediaStreamOptions;
      try {
        return await navigator.mediaDevices.getDisplayMedia(constraints);
      } catch (err) {
        const name = (err as Error).name;
        // Человек закрыл окно выбора — это не ошибка.
        if (name === 'NotAllowedError' || name === 'AbortError') return 'cancelled';
        return 'failed';
      }
    },
    [],
  );

  const stopScreenShare = useCallback<UseCallApi['stopScreenShare']>(() => {
    const share = screenShareRef.current;
    if (!share) return;
    screenShareRef.current = null;
    setScreenShareState(null);
    for (const t of share.stream.getTracks()) {
      t.onended = null;
      t.stop();
    }
    // Линии остаются в соединении пустыми — следующий запуск их переиспользует.
    void attachScreenTracks(null).finally(() => broadcastMyMedia());
  }, [attachScreenTracks, broadcastMyMedia]);

  /** Принять новый захват: показать, отправить, сообщить собеседнику. */
  const adoptCapture = useCallback(
    async (
      capture: MediaStream,
      surface: ScreenSurface,
      options: ScreenShareOptions,
    ): Promise<ScreenShareResult> => {
      const video = capture.getVideoTracks()[0];
      // Передача остановлена из самого браузера («Прекратить показ») — гасим
      // демонстрацию, иначе у собеседника застынет кадр.
      if (video) {
        video.contentHint = 'detail';
        video.onended = () => {
          if (screenShareRef.current?.stream === capture) stopScreenShare();
        };
      }
      const settings = video?.getSettings() as (MediaTrackSettings & { displaySurface?: string }) | undefined;
      const actualSurface =
        settings?.displaySurface === 'monitor' ||
        settings?.displaySurface === 'window' ||
        settings?.displaySurface === 'browser'
          ? settings.displaySurface
          : surface;
      const share: ActiveScreenShare = {
        stream: capture,
        surface: actualSurface,
        options,
        hasAudio: capture.getAudioTracks().length > 0,
        label: video?.label ?? '',
      };
      screenShareRef.current = share;
      setScreenShareState(share);
      await attachScreenTracks(capture);
      await limitScreenSending(options);
      saveScreenOptions(options);
      await waitScreenMid();
      broadcastMyMedia();
      return options.withAudio && !share.hasAudio ? 'no-audio' : 'ok';
    },
    [attachScreenTracks, limitScreenSending, waitScreenMid, broadcastMyMedia, stopScreenShare],
  );

  const startScreenShare = useCallback<UseCallApi['startScreenShare']>(
    async (surface, options) => {
      if (stateRef.current !== 'in' || screenShareRef.current) return 'failed';
      const capture = await captureScreen(surface, options);
      if (typeof capture === 'string') return capture;
      // Пока выбирали, звонок мог закончиться.
      if (stateRef.current !== 'in') {
        for (const t of capture.getTracks()) t.stop();
        return 'cancelled';
      }
      return adoptCapture(capture, surface, options);
    },
    [captureScreen, adoptCapture],
  );

  const updateScreenShare = useCallback<UseCallApi['updateScreenShare']>(
    async (surface, options) => {
      const current = screenShareRef.current;
      if (!current) return startScreenShare(surface, options);
      const video = current.stream.getVideoTracks()[0];

      // Тот же источник и звук не просят заново — меняем только качество на
      // ходу: дорожка та же, у собеседника картинка не мигает.
      const sameSource = surface === current.surface;
      const audioSame = options.withAudio === current.hasAudio;
      if (sameSource && (audioSame || !options.withAudio)) {
        if (video) await video.applyConstraints(screenVideoConstraints(options)).catch(() => undefined);
        if (!options.withAudio && current.hasAudio) {
          for (const t of current.stream.getAudioTracks()) {
            current.stream.removeTrack(t);
            t.stop();
          }
        }
        const next: ActiveScreenShare = {
          ...current,
          options,
          hasAudio: current.stream.getAudioTracks().length > 0,
        };
        screenShareRef.current = next;
        setScreenShareState(next);
        await attachScreenTracks(current.stream);
        await limitScreenSending(options);
        saveScreenOptions(options);
        broadcastMyMedia();
        return 'ok';
      }

      // Другой источник или понадобился звук — нужен новый захват. Старая
      // демонстрация идёт, пока человек выбирает, и сменяется подменой дорожки.
      const capture = await captureScreen(surface, options);
      if (typeof capture === 'string') return capture;
      for (const t of current.stream.getTracks()) {
        t.onended = null;
        t.stop();
      }
      return adoptCapture(capture, surface, options);
    },
    [startScreenShare, captureScreen, adoptCapture, attachScreenTracks, limitScreenSending, broadcastMyMedia],
  );

  const getStats = useCallback<UseCallApi['getStats']>(async (peerUserId) => {
    const rec = pcsRef.current.get(peerUserId);
    if (!rec) return null;
    try {
      return await rec.pc.getStats();
    } catch {
      return null;
    }
  }, []);

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

  /**
   * Перезахватить микрофон и подменить дорожку, не пересогласовывая соединение.
   * Одним путём идут и смена устройства, и смена обработки звука: и то, и
   * другое задаётся только при захвате.
   */
  const recaptureMic = useCallback(async (
    deviceId: string | null,
    mode: 'ideal' | 'exact',
  ): Promise<void> => {
    if (stateRef.current !== 'in') return;
    const local = localStreamRef.current;
    if (!local) return;
    let newStream: MediaStream;
    try {
      // `exact` so the browser actually gives us the device the user picked,
      // not the original mic with a non-binding `ideal` hint.
      newStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints(deviceId, mode),
      });
    } catch (err) {
      console.warn('[call] recaptureMic getUserMedia failed', err);
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
    console.log('[call] mic recaptured', deviceId ?? 'default');
  }, []);

  const switchMic = useCallback<UseCallApi['switchMic']>(async (deviceId) => {
    useCallSettingsStore.getState().setPreferredMicId(deviceId);
    await recaptureMic(deviceId, 'exact');
  }, [recaptureMic]);

  // Обработка звука задаётся при захвате, поэтому её переключение — это
  // перезахват микрофона. Своё шумоподавление живёт поверх браузерного и
  // снимается отдельно, иначе тумблер не менял бы ничего на слух.
  const noiseSuppression = useCallSettingsStore((s) => s.noiseSuppression);
  const echoCancellation = useCallSettingsStore((s) => s.echoCancellation);
  const autoGainControl = useCallSettingsStore((s) => s.autoGainControl);
  const processingReady = useRef(false);
  useEffect(() => {
    if (state !== 'in') {
      processingReady.current = false;
      return;
    }
    pipelineRef.current?.setDenoiseEnabled(noiseSuppression);
    // Первый заход — это вход в звонок: микрофон только что взят с этими же
    // настройками, второй раз его брать незачем.
    if (!processingReady.current) {
      processingReady.current = true;
      return;
    }
    void recaptureMic(useCallSettingsStore.getState().preferredMicId, 'ideal');
  }, [state, noiseSuppression, echoCancellation, autoGainControl, recaptureMic]);

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
    if (!stream || !outbound) return false;
    const existing = rawCameraTrackRef.current;
    if (existing) {
      // Turn camera OFF: stop raw track, clear ref, let syncOutboundVideo
      // tear down the mirror pipeline + remove senders.
      try { stream.removeTrack(existing); } catch { /* ignore */ }
      try { existing.stop(); } catch { /* ignore */ }
      rawCameraTrackRef.current = null;
      await syncOutboundVideo();
      broadcastMyMedia();
      return false;
    }
    const { preferredCameraId } = useCallSettingsStore.getState();
    let camStream: MediaStream;
    try {
      camStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints(preferredCameraId),
      });
    } catch {
      setPermissionError('denied');
      return false;
    }
    const track = camStream.getVideoTracks()[0];
    if (!track) return false;
    stream.addTrack(track);
    rawCameraTrackRef.current = track;
    // syncOutboundVideo builds the mirror pipeline (if mirror is on), wires
    // up the outbound stream, and adds the track to each PC.
    await syncOutboundVideo();
    broadcastMyMedia();
    return true;
  }, [broadcastMyMedia, syncOutboundVideo]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      // Hook-level teardown. Avoid sending leave during route changes since the
      // server cleans us up on WS close anyway.
      const share = screenShareRef.current;
      if (share) for (const t of share.stream.getTracks()) t.stop();
      screenShareRef.current = null;
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
    micOn,
    linkStates,
    getStats,
    screenShare,
    startScreenShare,
    updateScreenShare,
    stopScreenShare,
    startMicCheck,
    stopMicCheck,
    remoteStreams,
    setScreenHint,
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
