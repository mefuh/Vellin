import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { CallMember } from '@vellin/shared';
import { useAuthStore } from '../../stores/authStore';
import { useDmCallStore } from '../../stores/dmCallStore';
import { useCall, type CallTransport } from '../../hooks/useCall';
import { dmCallMediaBus, dmCallSignalBus, dmCallSpeakingBus } from '../../ws/dmCallBuses';
import { RemoteAudioMixer } from '../room/RemoteAudioMixer';
import { IncomingCallModal } from './IncomingCallModal';
import { DmCallOverlay } from './DmCallOverlay';
import { DmCallMiniBar } from './DmCallMiniBar';
import { startRingtone } from '../../utils/sound';

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
      media: (audio, video) => {
        // Демонстрацию экрана сайт не ведёт — она есть только в клиенте для
        // Windows, поэтому свой флаг всегда выключен.
        if (callId) send({ t: 'dmcall_media', callId, audio, video, screen: false });
      },
      speaking: (speaking) => {
        if (callId) send({ t: 'dmcall_speaking', callId, speaking });
      },
    }),
    [callId, send],
  );

  // Собеседник перезашёл (перезагрузил страницу, вернулся после обрыва) — его
  // соединение сменилось, а наше соединение с ним стало мёртвым. Убираем его из
  // участников на один тик: хук закроет старое соединение и создаст новое.
  const peerConnId = call
    ? call.callerId === myUserId
      ? call.calleeConnId
      : call.callerConnId
    : null;
  const prevPeerConnRef = useRef<string | null>(null);
  const [peerDropped, setPeerDropped] = useState(false);
  useEffect(() => {
    const prev = prevPeerConnRef.current;
    prevPeerConnRef.current = peerConnId;
    if (!prev || !peerConnId || prev === peerConnId) return;
    setPeerDropped(true);
    const t = window.setTimeout(() => setPeerDropped(false), 80);
    return () => window.clearTimeout(t);
  }, [peerConnId]);

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
  const joinedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (active && callId && joinedForRef.current !== callId) {
      joinedForRef.current = callId;
      void callApi.join({ withVideo: !!call?.video });
    }
    if (!active && joinedForRef.current) {
      joinedForRef.current = null;
      callApi.leave();
    }
  }, [active, callId, call?.video, callApi]);

  // Соединение установлено — сообщаем серверу, иначе он посчитает звонок
  // несостоявшимся и завершит его по таймауту.
  const connectedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!active || !callId || connectedRef.current === callId) return;
    if (callApi.remoteStreams.size > 0) {
      connectedRef.current = callId;
      send({ t: 'dmcall_connected', callId });
    }
  }, [active, callId, callApi.remoteStreams, send]);

  // Звонок у получателя: пока входящий висит — звоним.
  useEffect(() => {
    if (!incoming) return;
    return startRingtone();
  }, [incoming]);

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
      {incoming && <IncomingCallModal />}
      {/* Экран нужен и во время дозвона, а не только в разговоре. */}
      {isMine && peer && uiMode === 'expanded' && <DmCallOverlay api={callApi} />}
      {isMine && peer && uiMode === 'minimized' && <DmCallMiniBar api={callApi} />}
      <DmCallToast />
    </>
  );
}

/** Сообщение о неудавшемся звонке: «занят», «нет в сети», запрет и прочее. */
function DmCallToast(): React.ReactElement | null {
  const error = useDmCallStore((s) => s.error);
  const clearError = useDmCallStore((s) => s.clearError);

  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(clearError, 5000);
    return () => window.clearTimeout(t);
  }, [error, clearError]);

  if (!error) return null;
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        top: 'calc(16px + env(safe-area-inset-top, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1400,
        padding: '10px 16px',
        borderRadius: 999,
        background: 'var(--bg-2)',
        border: '1px solid var(--line-2)',
        boxShadow: 'var(--shadow-3)',
        color: 'var(--text-0)',
        fontSize: 13.5,
        maxWidth: 'calc(100vw - 32px)',
      }}
    >
      {error}
    </div>
  );
}
