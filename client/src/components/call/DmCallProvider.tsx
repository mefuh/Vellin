import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import type { CallMember } from '@vellin/shared';
import { useAuthStore } from '../../stores/authStore';
import { useDmCallStore } from '../../stores/dmCallStore';
import { useCall, type CallTransport, type UseCallApi } from '../../hooks/useCall';
import { dmCallMediaBus, dmCallSignalBus, dmCallSpeakingBus } from '../../ws/dmCallBuses';
import { RemoteAudioMixer } from '../room/RemoteAudioMixer';
import { CallInviteWindow, type CallInviteData } from './CallInviteWindow';
import { CallScreen, EndedCurtain, type CallNetState } from './DmCallOverlay';
import { DmCallBar } from './DmCallBar';
import { PulseDot, usePresence } from './CallBits';
import { startRingbackTone, startRingtone } from '../../utils/sound';
import './call.css';

/** Этап звонка для интерфейса — как `CallPhase` в клиенте для Windows. */
type CallPhase = 'none' | 'incoming' | 'outgoing' | 'connecting' | 'active';

/**
 * Звонок один на один в личных сообщениях.
 *
 * Монтируется ВЫШЕ маршрутов (см. App.tsx): разговор не должен прерываться от
 * перехода по сайту. Звук живёт в общем микшере, поэтому продолжает играть,
 * даже когда никакой экран звонка не смонтирован.
 */
export function DmCallProvider(): React.ReactElement | null {
  const myUserId = useAuthStore((s) => s.user?.id ?? null);
  const call = useDmCallStore((s) => s.call);
  const peer = useDmCallStore((s) => s.peer);
  const incoming = useDmCallStore((s) => s.incoming);
  const accepting = useDmCallStore((s) => s.accepting);
  const rtc = useDmCallStore((s) => s.rtc);
  const uiMode = useDmCallStore((s) => s.uiMode);
  const send = useDmCallStore((s) => s.send);
  const isMine = useDmCallStore((s) => s.isMine());

  const callId = call?.callId ?? null;
  const peerId = call ? (call.callerId === myUserId ? call.calleeId : call.callerId) : null;
  const active = !!call && call.phase === 'active' && isMine;

  // Транспорт поверх пользовательского канала. `join` пустой: сервер уже знает
  // о звонке из приглашения и ответа — присоединяться отдельно не к чему.
  const transport = useMemo<CallTransport>(
    () => ({
      join: () => {},
      leave: () => {
        if (callId) send({ t: 'dmcall_hangup', callId });
      },
      signal: (_toUserId, payload) => {
        if (callId) send({ t: 'dmcall_signal', callId, payload });
      },
      media: (audio, video, screen) => {
        if (!callId) return;
        send({
          t: 'dmcall_media',
          callId,
          audio,
          video,
          screen: !!screen,
          // Приметы дорожки демонстрации — по ним собеседник отличит её от камеры.
          ...(screen?.mid ? { screenMid: screen.mid } : {}),
          ...(screen?.streamId ? { screenStreamId: screen.streamId } : {}),
        });
      },
      speaking: (speaking) => {
        if (callId) send({ t: 'dmcall_speaking', callId, speaking });
      },
    }),
    [callId, send],
  );

  // Кто-то из двоих перезашёл: перезагрузил страницу или вернулся после
  // обрыва связи с сервером. Его соединение с сайтом сменилось — и у обоих
  // соединение друг с другом пересоздаётся заново, на один тик убрав
  // собеседника из участников. Делать это должны обе стороны: если одна
  // пересоздаст, а другая оставит старое, они не договорятся.
  const peerConnId = call
    ? call.callerId === myUserId
      ? call.calleeConnId
      : call.callerConnId
    : null;
  const myConnId = useDmCallStore((s) => s.myConnId);
  const linkKey = `${myConnId ?? ''}|${peerConnId ?? ''}`;
  const prevLinkKeyRef = useRef<string | null>(null);
  const [peerDropped, setPeerDropped] = useState(false);
  useEffect(() => {
    const prev = prevLinkKeyRef.current;
    prevLinkKeyRef.current = linkKey;
    if (!prev || !peerConnId || !myConnId || prev === linkKey) return;
    setPeerDropped(true);
    const t = window.setTimeout(() => setPeerDropped(false), 80);
    return () => window.clearTimeout(t);
  }, [linkKey, peerConnId, myConnId]);

  // Хук открывает соединения по списку участников: в личном звонке их всегда
  // двое, и только пока разговор идёт.
  const members = useMemo<CallMember[]>(() => {
    if (!active || !myUserId || !peerId || !call || peerDropped) return [];
    const joinedAt = Date.parse(call.answeredAt ?? call.createdAt) || Date.now();
    return [
      { userId: myUserId, ...(call.media[myUserId] ?? { audio: true, video: false }), joinedAt },
      { userId: peerId, ...(call.media[peerId] ?? { audio: true, video: false }), joinedAt },
    ];
  }, [active, myUserId, peerId, call, peerDropped]);

  const onLocalMedia = useCallback(() => {
    // Своё состояние микрофона и камеры уже уходит на сервер через транспорт,
    // а обратно приезжает в снапшоте звонка — отдельно хранить его незачем.
  }, []);

  const callApi = useCall({
    myUserId,
    myUserKind: 'user',
    rtcConfig: rtc,
    callMembers: members,
    // Личный звонок восстанавливается своим путём (dmcall_rejoin), поэтому
    // реконнект-логика хука здесь не нужна: состояние стабильно.
    wsState: 'open',
    transport,
    signalBus: dmCallSignalBus,
    speakingBus: dmCallSpeakingBus,
    onLocalMedia,
  });

  // Приметы дорожки демонстрации собеседника — соединению, чтобы оно не
  // приняло её за камеру. Подсказка может прийти и раньше самой дорожки, и
  // позже: раскладка потоков пересобирается в обоих случаях.
  const setScreenHint = callApi.setScreenHint;
  useEffect(() => {
    return dmCallMediaBus.on((fromUserId, media) => {
      setScreenHint(
        fromUserId,
        media.screen ? { mid: media.screenMid, streamId: media.screenStreamId } : null,
      );
    });
  }, [setScreenHint]);

  // Захват микрофона поднимаем, когда разговор начался, и отпускаем в конце.
  // Микрофон включён сразу — как в приложении: ответив, человек говорит.
  const joinedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (active && callId && joinedForRef.current !== callId) {
      joinedForRef.current = callId;
      void callApi.join({ withVideo: !!call?.video, micOn: true });
    }
    if (!active && joinedForRef.current) {
      joinedForRef.current = null;
      callApi.leave();
    }
  }, [active, callId, call?.video, callApi]);

  // Связь поднялась — окно вызова уступает место экрану разговора. Именно
  // этим, а не первыми замерами сети, отделяется «подключение» от разговора.
  const peerLink = peerId ? callApi.linkStates.get(peerId) : undefined;
  const [liveFor, setLiveFor] = useState<string | null>(null);
  useEffect(() => {
    if (!active || !callId || liveFor === callId) return;
    if (peerLink === 'connected') setLiveFor(callId);
  }, [active, callId, peerLink, liveFor]);
  useEffect(() => {
    if (!call) setLiveFor(null);
  }, [call]);
  const mediaLive = !!callId && liveFor === callId;

  // Соединение установлено — сообщаем серверу, иначе он посчитает звонок
  // несостоявшимся и завершит его по таймауту.
  const connectedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!active || !callId || connectedRef.current === callId) return;
    if (mediaLive || callApi.remoteStreams.size > 0) {
      connectedRef.current = callId;
      send({ t: 'dmcall_connected', callId });
    }
  }, [active, callId, mediaLive, callApi.remoteStreams, send]);

  const net = useNetState(callApi, peerId, active && mediaLive, peerLink);

  const phase: CallPhase = incoming
    ? 'incoming'
    : !call || !isMine
      ? accepting
        ? 'connecting'
        : 'none'
      : call.phase === 'ringing'
        ? 'outgoing'
        : mediaLive
          ? 'active'
          : 'connecting';

  // Звонок у получателя: пока входящий висит — звоним.
  useEffect(() => {
    if (!incoming) return;
    return startRingtone();
  }, [incoming]);

  // Гудки, пока идёт дозвон: звук следует за нажатием кнопки, поэтому играет.
  useEffect(() => {
    if (phase !== 'outgoing') return;
    return startRingbackTone();
  }, [phase]);

  // Своя демонстрация крупно — выбор живёт, пока идёт демонстрация.
  const [showMyPreview, setShowMyPreview] = useState(false);
  useEffect(() => {
    if (!callApi.screenShare) setShowMyPreview(false);
  }, [callApi.screenShare]);

  // Комната во время звонка недоступна. Сервер откажет в любом случае (409 на
  // вход и отказ при подключении), но лучше не пускать на страницу вовсе, чем
  // показывать ошибку после перехода.
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (!call || call.phase === 'ended') return;
    if (!location.pathname.startsWith('/room/')) return;
    navigate('/library', { replace: true });
    useDmCallStore.setState({ error: 'Завершите звонок, чтобы войти в комнату' });
  }, [call, location.pathname, navigate]);

  if (!myUserId) return null;

  return (
    <>
      {/* Звук вне экранов звонка — продолжает играть при сворачивании. */}
      <RemoteAudioMixer streams={callApi.remoteStreams} />
      <CallLayer api={callApi} phase={phase} net={net} showMyPreview={showMyPreview} setShowMyPreview={setShowMyPreview} />
      {isMine && call && peer && uiMode === 'minimized' && (
        <DmCallBar
          api={callApi}
          call={call}
          peer={peer}
          onExpand={() => useDmCallStore.getState().setUiMode('expanded')}
          onHangup={() => useDmCallStore.getState().hangup()}
        />
      )}
      <DmCallError />
    </>
  );
}

/**
 * Слой звонка: окно вызова и экран разговора, каждое со своей анимацией
 * появления и ухода. Перенос `_CallLayerContent` из приложения.
 */
function CallLayer({
  api,
  phase,
  net,
  showMyPreview,
  setShowMyPreview,
}: {
  api: UseCallApi;
  phase: CallPhase;
  net: CallNetState;
  showMyPreview: boolean;
  setShowMyPreview: (v: boolean) => void;
}) {
  const call = useDmCallStore((s) => s.call);
  const peer = useDmCallStore((s) => s.peer);
  const incoming = useDmCallStore((s) => s.incoming);
  const uiMode = useDmCallStore((s) => s.uiMode);

  // Окно вызова: всё, что до разговора.
  const who = phase === 'incoming' ? incoming?.from ?? null : peer;
  const inviteData = useMemo<CallInviteData | null>(() => {
    if (!who || (phase !== 'incoming' && phase !== 'outgoing' && phase !== 'connecting')) return null;
    return {
      phase,
      username: who.username,
      avatarUrl: who.avatarUrl ?? null,
      video: phase === 'incoming' ? !!incoming?.call.video : !!call?.video,
    };
  }, [phase, who, incoming, call?.video]);
  const invite = usePresence(inviteData, 500);
  // Снимок на время ухода обновляется вместе с этапом: «дозвон» сменился
  // «подключением» внутри одной карточки, а не новой.
  const inviteShown = inviteData ?? invite.shown;

  // Экран разговора: только когда звонок развёрнут.
  const stageOn = phase === 'active' && uiMode === 'expanded' && !!call && !!peer;
  const stage = usePresence(stageOn ? 'stage' : null, 500);

  // Имя собеседника на прощание: к концу разговора его в сторе уже нет.
  const lastPeerName = useRef<string | null>(null);
  if (peer) lastPeerName.current = peer.username;

  const onDecline = useCallback(() => {
    const s = useDmCallStore.getState();
    if (s.incoming) s.decline();
    else s.hangup();
  }, []);

  const modal = !!inviteShown || !!stage.shown;
  useModalSite(modal);

  if (!modal) return null;

  // Слой живёт вне #root: пока он открыт, сайт под ним инертен — клавиатура и
  // читалка экрана не уходят за затемнение.
  return createPortal(
    <div className="vc vc-layer">
      {stage.shown && (
        <div className="vc-stage" data-state={stage.state} role="dialog" aria-modal="true" aria-label={peer ? `Звонок с ${peer.username}` : 'Звонок'}>
          {/* Разговор кончился совсем — уход отмечаем прощальным кадром; если
              звонок просто свернули в полосу, экран молча гаснет. */}
          {call && peer ? (
            <CallScreen
              api={api}
              call={call}
              peer={peer}
              net={net}
              showMyPreview={showMyPreview}
              setShowMyPreview={setShowMyPreview}
              onMinimize={() => useDmCallStore.getState().setUiMode('minimized')}
              onHangup={() => useDmCallStore.getState().hangup()}
              onError={(message) => useDmCallStore.setState({ error: message })}
            />
          ) : (
            <EndedCurtain peerName={lastPeerName.current} />
          )}
        </div>
      )}
      {inviteShown && (
        <CallInviteWindow
          data={inviteShown}
          state={invite.state}
          // Уход после ответа — это не отбой, а начало разговора.
          rising={phase === 'active'}
          onDecline={onDecline}
          onAccept={
            inviteShown.phase === 'incoming'
              ? (video) => useDmCallStore.getState().accept(video)
              : undefined
          }
        />
      )}
    </div>,
    document.body,
  );
}

/**
 * Сайт под окном вызова и экраном разговора недоступен: `inert` снимает его с
 * клавиатуры и из дерева доступности. Фокус по закрытии возвращается туда,
 * откуда его забрали.
 */
function useModalSite(active: boolean): void {
  useLayoutEffect(() => {
    if (!active) return;
    const root = document.getElementById('root');
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root?.setAttribute('inert', '');
    return () => {
      root?.removeAttribute('inert');
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [active]);
}

/**
 * Состояние связи по статистике соединения: доля потерянных пакетов звука за
 * окно замера. Считаем по приросту, а не по общей сумме: общая копится с
 * начала разговора и после одной помехи так и остаётся высокой.
 */
function useNetState(
  api: UseCallApi,
  peerId: string | null,
  live: boolean,
  link: RTCPeerConnectionState | undefined,
): CallNetState {
  const [net, setNet] = useState<CallNetState>('connecting');
  const getStats = api.getStats;

  useEffect(() => {
    if (!live || !peerId) {
      setNet('connecting');
      return;
    }
    let last = { lost: 0, received: 0 };
    let first = true;
    let stopped = false;
    const poll = async (): Promise<void> => {
      const report = await getStats(peerId);
      if (stopped || !report) return;
      let lost = 0;
      let received = 0;
      report.forEach((s: { type?: string; kind?: string; packetsLost?: number; packetsReceived?: number }) => {
        if (s.type === 'inbound-rtp' && s.kind === 'audio') {
          lost += s.packetsLost ?? 0;
          received += s.packetsReceived ?? 0;
        }
      });
      const lostDelta = lost - last.lost;
      const total = lostDelta + (received - last.received);
      last = { lost, received };
      if (first) {
        first = false;
        setNet('good');
        return;
      }
      setNet(total > 0 && lostDelta / total > 0.03 ? 'weak' : 'good');
    };
    void poll();
    const t = window.setInterval(() => void poll(), 2000);
    return () => {
      stopped = true;
      window.clearInterval(t);
    };
  }, [live, peerId, getStats]);

  if (!live) return 'connecting';
  // Связь оборвалась — идёт восстановление.
  if (link === 'disconnected' || link === 'failed') return 'lost';
  return net;
}

/** Сообщение о неудавшемся звонке: «занят», «нет в сети», запрет и прочее. */
function DmCallError(): React.ReactElement | null {
  const error = useDmCallStore((s) => s.error);
  const clearError = useDmCallStore((s) => s.clearError);

  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(clearError, 5000);
    return () => window.clearTimeout(t);
  }, [error, clearError]);

  if (!error) return null;
  // Вне #root: во время звонка сайт инертен, и оттуда сообщение не дошло бы
  // до читалки экрана.
  return createPortal(
    <div className="vc vc-glass-pill vc-error" role="status" key={error}>
      <PulseDot color="#d65c52" period={1000} />
      <span className="vc-row-text">{error}</span>
    </div>,
    document.body,
  );
}
