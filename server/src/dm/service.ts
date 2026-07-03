import type { Conversation, DirectMessage } from '@prisma/client';
import type { DirectMessageDTO, DmConversation, DmEligibility, Gender, PublicUser } from '@vellin/shared';
import { prisma } from '../db/prisma.js';
import { canSee, parsePrivacy } from '../privacy/privacy.js';
import { PUBLIC_USER_SELECT, toPublicUser } from '../friends/mappers.js';
import { getAcceptedFriendIds } from '../friends/service.js';
import { userHub } from '../realtime/UserHub.js';
import { isDmImageUrl } from './image.js';
import { isDmVoiceUrl, sanitizeVoicePeaks } from './voice.js';

export const MAX_DM_BODY = 4000;
/** Сколько сообщений отдаём одной страницей треда. */
export const DM_PAGE = 40;

/** Ошибка отправки ЛС — несёт причину для UI и текст. */
export class DmError extends Error {
  constructor(public readonly reason: DmEligibility['reason'], message: string) {
    super(message);
    this.name = 'DmError';
  }
}

/** Канонический порядок пары: меньший id — это userA. */
function pair(a: string, b: string): { aId: string; bId: string } {
  return a < b ? { aId: a, bId: b } : { aId: b, bId: a };
}

/** Поле «прочитано до» текущего пользователя в данном диалоге. */
function myReadField(conv: Pick<Conversation, 'userAId'>, userId: string): 'aLastReadAt' | 'bLastReadAt' {
  return conv.userAId === userId ? 'aLastReadAt' : 'bLastReadAt';
}

function parseVoicePeaks(json: string | null): number[] | undefined {
  if (!json) return undefined;
  try {
    const v = JSON.parse(json) as unknown;
    return sanitizeVoicePeaks(v) ?? undefined;
  } catch {
    return undefined;
  }
}

export function dmRowToDto(m: DirectMessage, nonce?: string): DirectMessageDTO {
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    ...(m.videoStatus
      ? {
          videoStatus: m.videoStatus as 'processing' | 'ready' | 'failed',
          ...(m.videoUrl ? { videoUrl: m.videoUrl } : {}),
          ...(m.videoThumbUrl ? { videoThumbUrl: m.videoThumbUrl } : {}),
          ...(m.videoDurationSec != null ? { videoDurationSec: m.videoDurationSec } : {}),
        }
      : {}),
    ...(m.imageUrl
      ? {
          imageUrl: m.imageUrl,
          ...(m.imageWidth != null ? { imageWidth: m.imageWidth } : {}),
          ...(m.imageHeight != null ? { imageHeight: m.imageHeight } : {}),
        }
      : {}),
    ...(m.voiceUrl
      ? {
          voiceUrl: m.voiceUrl,
          ...(m.voiceDurationSec != null ? { voiceDurationSec: m.voiceDurationSec } : {}),
          ...(() => {
            const peaks = parseVoicePeaks(m.voicePeaksJson);
            return peaks ? { voicePeaks: peaks } : {};
          })(),
          voicePlayed: m.voicePlayedAt != null,
        }
      : {}),
    ...(nonce ? { nonce } : {}),
  };
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
 * Может ли `meId` писать пользователю `peer`. Учитывает: себя, блокировки,
 * настройку приватности «кто может писать» получателя (категория `messages`).
 */
export async function checkEligibility(
  meId: string,
  peer: { id: string; privacyJson: string },
): Promise<DmEligibility> {
  if (peer.id === meId) return { canMessage: false, reason: 'self' };
  if (await isBlockedEitherWay(meId, peer.id)) return { canMessage: false, reason: 'blocked' };
  const rule = parsePrivacy(peer.privacyJson).messages;
  const friend = await areFriends(meId, peer.id);
  const allowed = canSee(rule, { isSelf: false, isFriend: friend, viewerId: meId });
  if (!allowed) return { canMessage: false, reason: 'privacy' };
  return { canMessage: true, reason: 'ok' };
}

async function loadPeerOrThrow(peerId: string): Promise<{ id: string; privacyJson: string } & PublicUser> {
  const u = await prisma.user.findUnique({
    where: { id: peerId },
    select: { ...PUBLIC_USER_SELECT, privacyJson: true },
  });
  if (!u) throw new DmError('not_found', 'Пользователь не найден');
  return { ...toPublicUser(u), privacyJson: u.privacyJson };
}

async function getOrCreateConversation(meId: string, peerId: string): Promise<Conversation> {
  const { aId, bId } = pair(meId, peerId);
  return prisma.conversation.upsert({
    where: { userAId_userBId: { userAId: aId, userBId: bId } },
    create: { userAId: aId, userBId: bId },
    update: {},
  });
}

/** Непрочитанные в одном диалоге для пользователя (сообщения от собеседника). */
async function unreadInConversation(
  conversationId: string,
  userId: string,
  myRead: Date | null,
): Promise<number> {
  return prisma.directMessage.count({
    where: {
      conversationId,
      senderId: { not: userId },
      ...(myRead ? { createdAt: { gt: myRead } } : {}),
    },
  });
}

/** Суммарно непрочитанных ЛС у пользователя по всем диалогам (для бейджа). */
export async function unreadTotal(userId: string): Promise<number> {
  const convs = await prisma.conversation.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    select: { id: true, userAId: true, aLastReadAt: true, bLastReadAt: true },
  });
  let total = 0;
  for (const c of convs) {
    const myRead = c.userAId === userId ? c.aLastReadAt : c.bLastReadAt;
    total += await unreadInConversation(c.id, userId, myRead);
  }
  return total;
}

export interface SendResult {
  conversationId: string;
  /** Сообщение без nonce (для получателя). */
  message: DirectMessageDTO;
  sender: PublicUser;
  recipient: PublicUser;
}

export interface SendImage {
  url: string;
  width: number;
  height: number;
}

export interface SendVoice {
  url: string;
  durationSec: number;
  peaks: number[];
}

/** Видеосообщение при отправке: сырое видео уже загружено (uploadId), длительность. */
export interface SendVideoNote {
  uploadId: string;
  durationSec: number;
  /** Клиент уже применил финальную ориентацию (canvas со сменой камеры) — не зеркалить на сервере. */
  mirrored?: boolean;
}

/**
 * Сохранить личное сообщение от `meId` к `peerId` (текст и/или вложение —
 * изображение или голосовое). Бросает {@link DmError}, если писать нельзя.
 * Обновляет lastMessageAt диалога и отметку «прочитано» отправителя (свои
 * сообщения он уже «прочитал»).
 */
export async function sendMessage(
  meId: string,
  peerId: string,
  rawBody: string,
  image?: SendImage,
  voice?: SendVoice,
  video?: SendVideoNote,
): Promise<SendResult> {
  const body = rawBody.trim();
  if (!body && !image && !voice && !video) throw new DmError('ok', 'Пустое сообщение');
  if (body.length > MAX_DM_BODY) throw new DmError('ok', 'Сообщение слишком длинное');
  if (image && !isDmImageUrl(image.url)) throw new DmError('ok', 'Некорректное изображение');
  if (voice && !isDmVoiceUrl(voice.url)) throw new DmError('ok', 'Некорректное голосовое');

  const peer = await loadPeerOrThrow(peerId);
  const elig = await checkEligibility(meId, peer);
  if (!elig.canMessage) {
    const text =
      elig.reason === 'blocked'
        ? 'Вы не можете писать этому пользователю'
        : elig.reason === 'privacy'
          ? 'Пользователь ограничил, кто может ему писать'
          : 'Нельзя отправить сообщение';
    throw new DmError(elig.reason, text);
  }

  const conv = await getOrCreateConversation(meId, peerId);
  const message = await prisma.directMessage.create({
    data: {
      conversationId: conv.id,
      senderId: meId,
      body,
      ...(image
        ? { imageUrl: image.url, imageWidth: Math.round(image.width), imageHeight: Math.round(image.height) }
        : {}),
      ...(voice
        ? {
            voiceUrl: voice.url,
            voiceDurationSec: voice.durationSec,
            voicePeaksJson: JSON.stringify(sanitizeVoicePeaks(voice.peaks) ?? []),
          }
        : {}),
      ...(video
        ? { videoStatus: 'processing', videoDurationSec: video.durationSec }
        : {}),
    },
  });
  // lastMessageAt + отправитель «прочитал» собственное сообщение.
  await prisma.conversation.update({
    where: { id: conv.id },
    data: { lastMessageAt: message.createdAt, [myReadField(conv, meId)]: message.createdAt },
  });

  const me = await prisma.user.findUnique({ where: { id: meId }, select: PUBLIC_USER_SELECT });
  return {
    conversationId: conv.id,
    message: dmRowToDto(message),
    sender: me ? toPublicUser(me) : { id: meId, username: '', avatarSeed: '', avatarUrl: null, kind: 'user' },
    recipient: { id: peer.id, username: peer.username, avatarSeed: peer.avatarSeed, avatarUrl: peer.avatarUrl, kind: 'user' },
  };
}

/** Данные для рассылки обновления видеосообщения обоим участникам. */
export interface VideoNoteBroadcast {
  message: DirectMessageDTO;
  userAId: string;
  userBId: string;
}

async function loadForBroadcast(messageId: string): Promise<VideoNoteBroadcast | null> {
  const m = await prisma.directMessage.findUnique({
    where: { id: messageId },
    include: { conversation: { select: { userAId: true, userBId: true } } },
  });
  if (!m) return null;
  return { message: dmRowToDto(m), userAId: m.conversation.userAId, userBId: m.conversation.userBId };
}

/** Отметить видеосообщение готовым (после транскода) и вернуть данные для рассылки. */
export async function markVideoReady(
  messageId: string,
  res: { videoUrl: string; thumbUrl: string; durationSec: number },
): Promise<VideoNoteBroadcast | null> {
  await prisma.directMessage
    .update({
      where: { id: messageId },
      data: {
        videoUrl: res.videoUrl,
        videoThumbUrl: res.thumbUrl,
        videoDurationSec: res.durationSec > 0 ? res.durationSec : undefined,
        videoStatus: 'ready',
      },
    })
    .catch(() => {});
  return loadForBroadcast(messageId);
}

/** Отметить видеосообщение проваленным (транскод не удался). */
export async function markVideoFailed(messageId: string): Promise<VideoNoteBroadcast | null> {
  await prisma.directMessage
    .update({ where: { id: messageId }, data: { videoStatus: 'failed' } })
    .catch(() => {});
  return loadForBroadcast(messageId);
}

/** id всех сообщений в статусе processing (для восстановления транскода на старте). */
export async function processingVideoMessageIds(): Promise<string[]> {
  const rows = await prisma.directMessage.findMany({
    where: { videoStatus: 'processing' },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export interface MarkReadResult {
  conversationId: string;
  /** Кому принадлежит непрочитанное (получатель отметки = он сам). */
  readAt: string;
  unreadTotal: number;
  /** id собеседника — кому слать обновление «галочек». */
  peerId: string;
}

/**
 * Отметить переписку с `peerId` прочитанной до текущего момента. Возвращает
 * данные для realtime-оповещения (себя и собеседника). Если диалога нет —
 * no-op c актуальным суммарным счётчиком.
 */
export async function markRead(meId: string, peerId: string): Promise<MarkReadResult | null> {
  const { aId, bId } = pair(meId, peerId);
  const conv = await prisma.conversation.findUnique({
    where: { userAId_userBId: { userAId: aId, userBId: bId } },
  });
  if (!conv) return null;
  const now = new Date();
  await prisma.conversation.update({
    where: { id: conv.id },
    data: { [myReadField(conv, meId)]: now },
  });
  return {
    conversationId: conv.id,
    readAt: now.toISOString(),
    unreadTotal: await unreadTotal(meId),
    peerId,
  };
}

export interface VoicePlayedResult {
  conversationId: string;
  messageId: string;
  /** Автор голосового — ему шлём обновление индикатора «прослушано». */
  senderId: string;
}

/**
 * Отметить голосовое сообщение прослушанным слушателем `meId`. Разрешено только
 * получателю (не автору) и только для голосовых в его диалоге. Идемпотентно:
 * повторный вызов вернёт результат, но не перезапишет момент. Возвращает null,
 * если сообщение не найдено/не голосовое/нет доступа.
 */
export async function markVoicePlayed(meId: string, messageId: string): Promise<VoicePlayedResult | null> {
  const m = await prisma.directMessage.findUnique({
    where: { id: messageId },
    include: { conversation: { select: { userAId: true, userBId: true } } },
  });
  if (!m || !m.voiceUrl) return null;
  const isParticipant = m.conversation.userAId === meId || m.conversation.userBId === meId;
  if (!isParticipant || m.senderId === meId) return null; // только получатель
  if (!m.voicePlayedAt) {
    await prisma.directMessage.update({ where: { id: m.id }, data: { voicePlayedAt: new Date() } });
  }
  return { conversationId: m.conversationId, messageId: m.id, senderId: m.senderId };
}

/** Список диалогов пользователя (по убыванию активности). */
export async function listConversations(
  userId: string,
): Promise<{ conversations: DmConversation[]; unreadTotal: number }> {
  const convs = await prisma.conversation.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    orderBy: { lastMessageAt: 'desc' },
    include: {
      userA: { select: { ...PUBLIC_USER_SELECT, privacyJson: true } },
      userB: { select: { ...PUBLIC_USER_SELECT, privacyJson: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  const friendIds = new Set(await getAcceptedFriendIds(userId));

  let total = 0;
  const conversations: DmConversation[] = [];
  for (const c of convs) {
    const meIsA = c.userAId === userId;
    const other = meIsA ? c.userB : c.userA;
    const myRead = meIsA ? c.aLastReadAt : c.bLastReadAt;
    const peerRead = meIsA ? c.bLastReadAt : c.aLastReadAt;
    const last = c.messages[0];
    if (!last) continue; // пустой диалог-болванка — не показываем

    const unread = await unreadInConversation(c.id, userId, myRead);
    total += unread;
    const showOnline = canSee(parsePrivacy(other.privacyJson).online, {
      isSelf: false,
      isFriend: friendIds.has(other.id),
      viewerId: userId,
    });
    conversations.push({
      id: c.id,
      peer: toPublicUser(other),
      lastMessage: {
        body: last.body,
        senderId: last.senderId,
        createdAt: last.createdAt.toISOString(),
        hasImage: !!last.imageUrl,
        hasVoice: !!last.voiceUrl,
      },
      unreadCount: unread,
      peerLastReadAt: peerRead ? peerRead.toISOString() : null,
      online: showOnline && userHub.isOnline(other.id),
      lastMessageAt: c.lastMessageAt.toISOString(),
    });
  }
  return { conversations, unreadTotal: total };
}

export interface ThreadResult {
  conversationId: string;
  peer: PublicUser;
  messages: DirectMessageDTO[];
  hasMore: boolean;
  peerLastReadAt: string | null;
  online: boolean;
  peerLastSeenAt: string | null;
  peerGender: Gender | null;
  eligibility: DmEligibility;
}

/**
 * Тред переписки с пользователем по username. `before` — ISO-время, до которого
 * грузить более старые сообщения (пагинация «раньше»). Диалог НЕ создаётся при
 * чтении — только при первой отправке. Статус сети/«был в сети»/пол отдаются
 * с тем же гейтингом приватности, что и в публичном профиле.
 */
export async function getThreadByUsername(
  meId: string,
  username: string,
  before?: string,
): Promise<ThreadResult> {
  const u = await prisma.user.findUnique({
    where: { username },
    select: { ...PUBLIC_USER_SELECT, privacyJson: true, gender: true, lastSeenAt: true },
  });
  if (!u) {
    const err = new Error('Пользователь не найден') as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }
  const peer = toPublicUser(u);
  const eligibility = await checkEligibility(meId, { id: u.id, privacyJson: u.privacyJson });

  // Статус сети с учётом приватности (online → presence/«был в сети»;
  // personalInfo → пол для грамматики «был/была»).
  const ctx = { isSelf: false, isFriend: await areFriends(meId, u.id), viewerId: meId };
  const priv = parsePrivacy(u.privacyJson);
  const showOnline = canSee(priv.online, ctx);
  const raw = userHub.presenceOf(u.id);
  const online = showOnline && raw.online;
  const peerLastSeenAt = showOnline
    ? raw.lastSeenAt ?? (u.lastSeenAt ? u.lastSeenAt.toISOString() : null)
    : null;
  const peerGender = canSee(priv.personalInfo, ctx) ? ((u.gender as Gender | null) ?? null) : null;

  const { aId, bId } = pair(meId, u.id);
  const conv = await prisma.conversation.findUnique({
    where: { userAId_userBId: { userAId: aId, userBId: bId } },
  });

  if (!conv) {
    return {
      conversationId: '',
      peer,
      messages: [],
      hasMore: false,
      peerLastReadAt: null,
      online,
      peerLastSeenAt,
      peerGender,
      eligibility,
    };
  }

  const rows = await prisma.directMessage.findMany({
    where: { conversationId: conv.id, ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: DM_PAGE + 1,
  });
  const hasMore = rows.length > DM_PAGE;
  const page = rows.slice(0, DM_PAGE).reverse();

  const peerRead = conv.userAId === u.id ? conv.aLastReadAt : conv.bLastReadAt;

  return {
    conversationId: conv.id,
    peer,
    messages: page.map((m) => dmRowToDto(m)),
    hasMore,
    peerLastReadAt: peerRead ? peerRead.toISOString() : null,
    online,
    peerLastSeenAt,
    peerGender,
    eligibility,
  };
}
