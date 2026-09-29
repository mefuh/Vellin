import type { CallSignalPayload, PublicUser, UserS2CDmCallError } from '@vellin/shared';
import { isToggleEnabled } from '../admin/platform/gate.js';
import { getRtcConfig } from '../env.js';
import { notifyAsync } from '../push/notificationService.js';
import { userHub } from '../realtime/UserHub.js';
import { logger } from '../utils/logger.js';
import { dmCallHub, toSnapshot, type DmCallSession } from './DmCallHub.js';
import { checkCallEligibility, loadCallPeer, writeCallRecord } from './service.js';

type ErrorCode = UserS2CDmCallError['code'];

const ERROR_TEXT: Record<ErrorCode, string> = {
  busy_in_room: 'Собеседник сейчас смотрит в комнате',
  busy_in_call: 'Собеседник сейчас разговаривает',
  caller_in_room: 'Выйдите из комнаты, чтобы позвонить',
  offline: 'Собеседник не в сети',
  privacy: 'Пользователь ограничил, кто может ему звонить',
  blocked: 'Звонок недоступен',
  self: 'Нельзя позвонить самому себе',
  not_found: 'Пользователь не найден',
  guest_forbidden: 'Гостям звонки недоступны',
  disabled: 'Звонки временно отключены администратором',
  screen_disabled: 'Демонстрация экрана временно отключена администратором',
  rate_limited: 'Слишком часто — подождите немного',
  no_session: 'Звонок уже завершён',
};

function fail(userId: string, code: ErrorCode, extra?: { nonce?: string; callId?: string }): void {
  userHub.pushTo(userId, {
    t: 'dmcall_error',
    code,
    message: ERROR_TEXT[code],
    ...(extra?.nonce ? { nonce: extra.nonce } : {}),
    ...(extra?.callId ? { callId: extra.callId } : {}),
  });
}

/** Карточки обеих сторон — каждому шлём собеседника, а не себя. */
async function bothPeers(s: DmCallSession): Promise<{ caller: PublicUser; callee: PublicUser } | null> {
  const [caller, callee] = await Promise.all([loadCallPeer(s.callerId), loadCallPeer(s.calleeId)]);
  if (!caller || !callee) return null;
  return { caller, callee };
}

/**
 * Разослать состояние звонка обеим сторонам на ВСЕ их соединения. Соединение,
 * которое ведёт разговор, получает вдобавок ICE-конфиг; остальные вкладки по
 * несовпадению connId понимают, что звонок не их.
 */
async function broadcastState(s: DmCallSession, nonce?: string): Promise<void> {
  const peers = await bothPeers(s);
  if (!peers) return;
  const call = toSnapshot(s);
  const live = s.phase !== 'ended';
  // ICE-конфиг выпускается под сессию и уходит только ведущим разговор
  // соединениям: у TURN-кредов ограниченный срок, раздавать их всем вкладкам ни
  // к чему. Каждое соединение получает РОВНО ОДНО сообщение о состоянии.
  const rtc = live ? getRtcConfig() : undefined;
  const nonceField = nonce ? { nonce } : {};

  userHub.pushToExcept(s.callerId, live ? s.callerConnId : null, {
    t: 'dmcall_state',
    call,
    peer: peers.callee,
    ...nonceField,
  });
  userHub.pushToExcept(s.calleeId, live ? s.calleeConnId : null, {
    t: 'dmcall_state',
    call,
    peer: peers.caller,
  });

  if (live && rtc) {
    userHub.pushToConn(s.callerConnId, {
      t: 'dmcall_state',
      call,
      peer: peers.callee,
      rtc,
      ...nonceField,
    });
    if (s.calleeConnId) {
      userHub.pushToConn(s.calleeConnId, { t: 'dmcall_state', call, peer: peers.caller, rtc });
    }
  }
}

/** Подключить хаб к рассылке и записи в переписку (вызывается на старте). */
export function initDmCalls(): void {
  dmCallHub.setChangedHook((s) => {
    void broadcastState(s);
  });
  dmCallHub.setEndedHook((s) => {
    void finishCall(s);
  });
  userHub.setConnectionClosedHook((conn) => {
    dmCallHub.noteConnectionClosed(conn.userId, conn.id);
  });
}

/** Завершение: запись в переписку + push о пропущенном. */
async function finishCall(s: DmCallSession): Promise<void> {
  try {
    const res = await writeCallRecord({
      callId: s.callId,
      callerId: s.callerId,
      calleeId: s.calleeId,
      video: s.video,
      endReason: s.endReason ?? 'failed',
      durationSec: dmCallHub.durationSec(s),
    });
    if (!res) return;

    // Запись уходит обычным сообщением — оба клиента отрисуют её тредом.
    userHub.pushTo(s.callerId, {
      t: 'dm_message',
      message: res.message,
      peer: res.callee,
      unreadTotal: 0,
    });
    userHub.pushTo(s.calleeId, {
      t: 'dm_message',
      message: res.message,
      peer: res.caller,
      unreadTotal: 0,
    });

    // Пропущенный — единственный случай, о котором стоит уведомлять отдельно.
    if (res.message.callOutcome === 'missed') {
      notifyAsync(s.calleeId, 'dm_call_missed', {
        username: res.caller.username,
        publicId: res.caller.publicId,
        conversationId: res.conversationId,
      });
    }
  } catch (err) {
    logger.error({ err, callId: s.callId }, 'dmcall:record failed');
  }
}

// ── Обработчики сообщений клиента ──────────────────────────────────────────

export async function handleDmCallInvite(
  callerId: string,
  connId: string,
  p: { toUserId: string; video: boolean; nonce: string },
): Promise<void> {
  const { toUserId, video, nonce } = p;

  if (toUserId === callerId) return fail(callerId, 'self', { nonce });

  // ВСЁ, что решает «можно ли занимать пару», делается синхронно и до первого
  // await. Между проверкой и бронью не должно быть точек передачи управления:
  // иначе пачка приглашений (двойное нажатие, две вкладки) проходит проверку
  // занятости целиком и создаёт несколько звонков на одну пару.
  const existing = dmCallHub.betweenUsers(callerId, toUserId);
  if (existing && existing.phase === 'ringing' && existing.calleeId === callerId) {
    // Встречный звонок: вместо обоюдного «занято» соединяем — второе
    // приглашение трактуем как ответ на уже идущий дозвон.
    const s = dmCallHub.accept(existing.callId, connId, video);
    if (s) return;
  }
  // Комната и звонок несовместимы в обе стороны.
  if (userHub.roomOfAny(callerId)) return fail(callerId, 'caller_in_room', { nonce });
  if (userHub.roomOfAny(toUserId)) return fail(callerId, 'busy_in_room', { nonce });
  if (dmCallHub.isRateLimited(callerId, toUserId)) return fail(callerId, 'rate_limited', { nonce });
  if (!dmCallHub.reserve(callerId, toUserId)) return fail(callerId, 'busy_in_call', { nonce });

  // Дальше идут обращения к базе — на любом отказе бронь надо снять, иначе
  // пара останется занятой навсегда.
  const deny = (code: ErrorCode): void => {
    dmCallHub.release(callerId, toUserId);
    fail(callerId, code, { nonce });
  };

  if (!(await isToggleEnabled('dmCalls'))) return deny('disabled');

  const peer = await loadCallPeer(toUserId);
  if (!peer) return deny('not_found');

  const elig = await checkCallEligibility(callerId, peer);
  if (!elig.canCall) return deny(elig.reason === 'blocked' ? 'blocked' : 'privacy');

  const caller = await loadCallPeer(callerId);
  if (!caller) return deny('not_found');

  const session = dmCallHub.create({ callerId, calleeId: toUserId, callerConnId: connId, video });

  // Получателя нет в сети — звонок сразу пропущенный, с записью в переписку.
  if (!userHub.hasConnection(toUserId)) {
    await broadcastState(session, nonce);
    dmCallHub.end(session.callId, 'missed');
    return;
  }

  await broadcastState(session, nonce);
  userHub.pushTo(toUserId, {
    t: 'dmcall_ring',
    call: toSnapshot(session),
    from: caller,
    rtc: getRtcConfig(),
  });
}

export async function handleDmCallAccept(
  userId: string,
  connId: string,
  p: { callId: string; video: boolean },
): Promise<void> {
  const s = dmCallHub.get(p.callId);
  if (!s || s.calleeId !== userId || s.phase !== 'ringing') {
    return fail(userId, 'no_session', { callId: p.callId });
  }
  // Пока звонили, человек мог зайти в комнату.
  if (userHub.roomOfAny(userId)) return fail(userId, 'busy_in_room', { callId: p.callId });
  dmCallHub.accept(p.callId, connId, p.video);
}

export function handleDmCallDecline(userId: string, callId: string): void {
  const s = dmCallHub.get(callId);
  // Отказаться можно только от дозвона: в разговоре это сообщение обрывало его
  // и записывало состоявшуюся беседу в переписку как отклонённую.
  if (!s || s.calleeId !== userId || s.phase !== 'ringing') return;
  dmCallHub.end(callId, 'declined');
}

export function handleDmCallCancel(userId: string, callId: string): void {
  const s = dmCallHub.get(callId);
  if (!s || s.callerId !== userId || s.phase !== 'ringing') return;
  dmCallHub.end(callId, 'cancelled');
}

export function handleDmCallHangup(userId: string, callId: string): void {
  const s = dmCallHub.get(callId);
  if (!s || (s.callerId !== userId && s.calleeId !== userId)) return;
  dmCallHub.end(callId, s.phase === 'ringing' ? (s.callerId === userId ? 'cancelled' : 'declined') : 'hangup');
}

/** Прозрачный релей SDP/ICE: сервер не разбирает содержимое. */
export function handleDmCallSignal(userId: string, callId: string, payload: CallSignalPayload): void {
  const s = dmCallHub.get(callId);
  if (!s || s.phase === 'ended') return;
  if (s.callerId !== userId && s.calleeId !== userId) return;
  const peerId = dmCallHub.peerOf(s, userId);
  const peerConn = dmCallHub.connOf(s, peerId);
  const msg = { t: 'dmcall_signal', callId, fromUserId: userId, payload } as const;
  // Адресно в ведущую разговор вкладку; до ответа её ещё нет — тогда всем.
  if (peerConn) userHub.pushToConn(peerConn, msg);
  else userHub.pushTo(peerId, msg);
}

export async function handleDmCallMedia(
  userId: string,
  callId: string,
  media: { audio: boolean; video: boolean; screen: boolean },
  screen?: { mid?: string; streamId?: string },
): Promise<void> {
  // Сначала — свой ли это звонок. Без проверки посторонний прописывался в
  // состав звонка и слал участнику состояние своих микрофона и демонстрации.
  const call = dmCallHub.get(callId);
  if (!call || !dmCallHub.isParticipant(call, userId)) return;

  // Демонстрацию можно выключить отдельно от звонков: она заметно тяжелее для
  // канала. Отказ гасит только её — разговор продолжается.
  let next = media;
  if (media.screen && !(await isToggleEnabled('dmScreenShare'))) {
    fail(userId, 'screen_disabled', { callId });
    next = { ...media, screen: false };
  }

  const s = dmCallHub.setMedia(callId, userId, next);
  if (!s) return;
  const peerId = dmCallHub.peerOf(s, userId);
  userHub.pushTo(peerId, {
    t: 'dmcall_media',
    callId,
    fromUserId: userId,
    audio: next.audio,
    video: next.video,
    screen: next.screen,
    // Приметы дорожки демонстрации — по ним собеседник отличит её от камеры.
    ...(next.screen && screen?.mid ? { screenMid: screen.mid } : {}),
    ...(next.screen && screen?.streamId ? { screenStreamId: screen.streamId } : {}),
  });
}

export function handleDmCallSpeaking(userId: string, callId: string, speaking: boolean): void {
  const s = dmCallHub.get(callId);
  if (!s || s.phase !== 'active') return;
  // Индикатор речи — тоже сообщение внутрь чужого разговора: без проверки
  // посторонний зажигал участнику кольцо «говорит».
  if (!dmCallHub.isParticipant(s, userId)) return;
  const peerId = dmCallHub.peerOf(s, userId);
  const peerConn = dmCallHub.connOf(s, peerId);
  const msg = { t: 'dmcall_speaking', callId, fromUserId: userId, speaking } as const;
  if (peerConn) userHub.pushToConn(peerConn, msg);
}

export function handleDmCallConnected(userId: string, callId: string): void {
  dmCallHub.markConnected(callId, userId);
}

export async function handleDmCallRejoin(userId: string, connId: string, callId: string): Promise<void> {
  const s = dmCallHub.rejoin(callId, userId, connId);
  if (!s) return fail(userId, 'no_session', { callId });
}
