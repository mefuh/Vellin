import type { DirectMessageDTO, DmCallEndReason, PublicUser } from '@vellin/shared';
import { prisma } from '../db/prisma.js';
import { PUBLIC_USER_SELECT, toPublicUser } from '../friends/mappers.js';
import { canSee, parsePrivacy } from '../privacy/privacy.js';

/** Почему звонок невозможен. `ok` — можно звонить. */
export type CallEligibilityReason = 'ok' | 'blocked' | 'privacy' | 'self' | 'not_found';

export interface CallEligibility {
  canCall: boolean;
  reason: CallEligibilityReason;
}

/** Заблокирован ли кто-то из пары другим (в любом направлении). */
async function isBlockedEitherWay(a: string, b: string): Promise<boolean> {
  const n = await prisma.block.count({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
  });
  return n > 0;
}

async function areFriends(a: string, b: string): Promise<boolean> {
  const n = await prisma.friendship.count({
    where: {
      status: 'accepted',
      OR: [
        { requesterId: a, addresseeId: b },
        { requesterId: b, addresseeId: a },
      ],
    },
  });
  return n > 0;
}

/**
 * Может ли `meId` позвонить пользователю `peer`. Повторяет логику
 * `dm/service.ts checkEligibility`, но смотрит на категорию приватности
 * `calls`: звонок назойливее сообщения, и настройка у него своя.
 */
export async function checkCallEligibility(
  meId: string,
  peer: { id: string; privacyJson: string },
): Promise<CallEligibility> {
  if (peer.id === meId) return { canCall: false, reason: 'self' };
  if (await isBlockedEitherWay(meId, peer.id)) return { canCall: false, reason: 'blocked' };
  const rule = parsePrivacy(peer.privacyJson).calls;
  const friend = await areFriends(meId, peer.id);
  if (!canSee(rule, { isSelf: false, isFriend: friend, viewerId: meId })) {
    return { canCall: false, reason: 'privacy' };
  }
  return { canCall: true, reason: 'ok' };
}

/** Карточка пользователя + его приватность (для проверок и рассылки). */
export async function loadCallPeer(
  userId: string,
): Promise<({ id: string; privacyJson: string } & PublicUser) | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { ...PUBLIC_USER_SELECT, privacyJson: true },
  });
  if (!u) return null;
  return { ...toPublicUser(u), privacyJson: u.privacyJson };
}

/** Диалог пары; создаётся, если переписки ещё не было. */
async function ensureConversation(a: string, b: string): Promise<string> {
  const [userAId, userBId] = a < b ? [a, b] : [b, a];
  const existing = await prisma.conversation.findFirst({
    where: { userAId, userBId },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.conversation.create({
    data: { userAId, userBId },
    select: { id: true },
  });
  return created.id;
}

/** Как звонок завершился → что записываем в переписку. */
function outcomeOf(reason: DmCallEndReason): DirectMessageDTO['callOutcome'] {
  switch (reason) {
    case 'hangup':
      return 'completed';
    case 'declined':
      return 'declined';
    case 'cancelled':
      return 'cancelled';
    case 'missed':
    case 'busy':
      return 'missed';
    default:
      return 'failed';
  }
}

export interface CallRecordInput {
  callId: string;
  callerId: string;
  calleeId: string;
  video: boolean;
  endReason: DmCallEndReason;
  /** Длительность разговора, сек (0 — не состоялся). */
  durationSec: number;
}

export interface CallRecordResult {
  conversationId: string;
  message: DirectMessageDTO;
  caller: PublicUser;
  callee: PublicUser;
}

/**
 * Записать состоявшийся (или несостоявшийся) звонок в переписку. Отправителем
 * всегда числится звонящий — направление выводится из senderId, поэтому
 * отдельного поля не нужно.
 */
export async function writeCallRecord(input: CallRecordInput): Promise<CallRecordResult | null> {
  const [caller, callee] = await Promise.all([
    loadCallPeer(input.callerId),
    loadCallPeer(input.calleeId),
  ]);
  if (!caller || !callee) return null;

  const conversationId = await ensureConversation(input.callerId, input.calleeId);
  const row = await prisma.directMessage.create({
    data: {
      conversationId,
      senderId: input.callerId,
      body: '',
      callId: input.callId,
      callKind: input.video ? 'video' : 'audio',
      callOutcome: outcomeOf(input.endReason),
      callDurationSec: Math.max(0, Math.round(input.durationSec)),
    },
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: row.createdAt },
  });

  const message: DirectMessageDTO = {
    id: row.id,
    conversationId,
    senderId: input.callerId,
    body: '',
    createdAt: row.createdAt.toISOString(),
    callId: input.callId,
    callKind: input.video ? 'video' : 'audio',
    callOutcome: outcomeOf(input.endReason),
    callDurationSec: Math.max(0, Math.round(input.durationSec)),
  };
  return { conversationId, message, caller, callee };
}
