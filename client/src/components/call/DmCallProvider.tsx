import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { CallMember } from '@vellin/shared';
import { useAuthStore } from '../../stores/authStore';
import { useDmCallStore } from '../../stores/dmCallStore';
import { useCall, type CallTransport } from '../../hooks/useCall';
import { dmCallSignalBus, dmCallSpeakingBus } from '../../ws/dmCallBuses';
import { RemoteAudioMixer } from '../room/RemoteAudioMixer';
import { IncomingCallModal } from './IncomingCallModal';
import { DmCallOverlay } from './DmCallOverlay';
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
        if (callId) send({ t: 'dmcall_media', callId, audio, video });
      },
      speaking: (speaking) => {
        if (callId) send({ t: 'dmcall_speaking', callId, speaking });
      },
    }),
    [callId, send],
  );

  // Хук открывает соединения по списку участников: в личном звонке их всегда
  // двое, и только пока разговор идёт.
  const members = useMemo<CallMember[]>(() => {
    if (!active || !myUserId || !peerId || !call) return [];
    const joinedAt = Date.parse(call.answeredAt ?? call.createdAt) || Date.now();
    return [
      { userId: myUserId, ...(call.media[myUserId] ?? { audio: true, video: false }), joinedAt },
      { userId: peerId, ...(call.media[peerId] ?? { audio: true, video: false }), joinedAt },
    ];
  }, [active, myUserId, peerId, call]);

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

  if (!myUserId) return null;

  return (
    <>
      {/* Звук вне экранов звонка — продолжает играть при сворачивании. */}
      <RemoteAudioMixer streams={callApi.remoteStreams} />
      {incoming && <IncomingCallModal />}
      {active && uiMode === 'expanded' && peer && <DmCallOverlay api={callApi} />}
    </>
  );
}
