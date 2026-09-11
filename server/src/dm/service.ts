import type { Conversation, DirectMessage, Room } from '@prisma/client';
import type {
  CallHistoryEntry,
  DirectMessageDTO,
  DirectMessageKind,
  DirectMessageReplyRef,
  DmConversation,
  DmEligibility,
  Gender,
  PublicUser,
} from '@vellin/shared';
import { prisma } from '../db/prisma.js';
import { canSee, parsePrivacy } from '../privacy/privacy.js';
import { PUBLIC_USER_SELECT, toPublicUser } from '../friends/mappers.js';
import { getAcceptedFriendIds } from '../friends/service.js';
import { userHub } from '../realtime/UserHub.js';
import { isDmImageUrl } from './image.js';
import { isDmVoiceUrl, sanitizeVoicePeaks } from './voice.js';
import { authorizeJoin, getRoomById, videoCardInfo, RoomServiceError } from '../rooms/service.js';
import { roomStore } from '../rooms/store.js';
import { absoluteUrl } from '../utils/urls.js';
import type { RoomInviteInfoResponse } from '@vellin/shared';

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
          ...(m.videoUrl ? { videoUrl: absoluteUrl(m.videoUrl) } : {}),
          ...(m.videoThumbUrl ? { videoThumbUrl: absoluteUrl(m.videoThumbUrl) } : {}),
          ...(m.videoDurationSec != null ? { videoDurationSec: m.videoDurationSec } : {}),
          videoPlayed: m.videoPlayedAt != null,
        }
      : {}),
    ...(m.imageUrl
      ? {
          imageUrl: absoluteUrl(m.imageUrl),
          ...(m.imageWidth != null ? { imageWidth: m.imageWidth } : {}),
          ...(m.imageHeight != null ? { imageHeight: m.imageHeight } : {}),
        }
      : {}),
    ...(m.voiceUrl
      ? {
          voiceUrl: absoluteUrl(m.voiceUrl),
          ...(m.voiceDurationSec != null ? { voiceDurationSec: m.voiceDurationSec } : {}),
          ...(() => {
            const peaks = parseVoicePeaks(m.voicePeaksJson);
            return peaks ? { voicePeaks: peaks } : {};
          })(),
          voicePlayed: m.voicePlayedAt != null,
        }
      : {}),
    ...(m.inviteRoomId
      ? {
          inviteRoomId: m.inviteRoomId,
          ...(m.inviteRoomSlug ? { inviteRoomSlug: m.inviteRoomSlug } : {}),
          ...(m.inviteRoomName ? { inviteRoomName: m.inviteRoomName } : {}),
          ...(m.inviteVideoTitle ? { inviteVideoTitle: m.inviteVideoTitle } : {}),
          ...(m.inviteVideoPoster ? { inviteVideoPoster: absoluteUrl(m.inviteVideoPoster) } : {}),
          inviteStatus: (m.inviteStatus ?? 'pending') as 'pending' | 'accepted' | 'declined' | 'expired',
        }
      : {}),
    // Запись о звонке: по ней клиент рисует плашку вместо пузыря переписки.
    ...(m.callId
      ? {
          callId: m.callId,
          ...(m.callKind ? { callKind: m.callKind as 'audio' | 'video' } : {}),
          ...(m.callOutcome
            ? {
                callOutcome: m.callOutcome as
                  | 'completed'
                  | 'missed'
                  | 'declined'
                  | 'cancelled'
                  | 'failed',
              }
            : {}),
          ...(m.callDurationSec != null ? { callDurationSec: m.callDurationSec } : {}),
        }
      : {}),
    ...(m.forwardedFromId
      ? { forwardedFrom: { userId: m.forwardedFromId, name: m.forwardedFromName ?? '' } }
      : {}),
    ...(m.editedAt ? { editedAt: m.editedAt.toISOString() } : {}),
    ...(m.readAt ? { readAt: m.readAt.toISOString() } : {}),
    // Прослушано — отдельный момент от «прочитано»: голосовое можно увидеть
    // в ленте и не включить.
    ...((m.voicePlayedAt ?? m.videoPlayedAt)
      ? { playedAt: (m.voicePlayedAt ?? m.videoPlayedAt)!.toISOString() }
      : {}),
    ...(nonce ? { nonce } : {}),
  };
}

/** Чем является сообщение — для цитаты ответа и полосы закрепа. */
function kindOf(m: DirectMessage): DirectMessageKind {
  if (m.callId) return 'call';
  if (m.inviteRoomId) return 'invite';
  if (m.videoStatus) return 'video';
  if (m.voiceUrl) return 'voice';
  if (m.imageUrl) return 'image';
  return 'text';
}

function replyRefOf(m: DirectMessage): DirectMessageReplyRef {
  return { id: m.id, senderId: m.senderId, kind: kindOf(m), body: m.body.slice(0, 160) };
}

/**
 * Строки → DTO с цитатами ответов. Оригиналы подтягиваются одним запросом на
 * всю страницу, а не по одному на сообщение.
 */
export async function toDtos(rows: DirectMessage[]): Promise<DirectMessageDTO[]> {
  const ids = [...new Set(rows.map((r) => r.replyToId).filter((x): x is string => !!x))];
  const originals = ids.length ? await prisma.directMessage.findMany({ where: { id: { in: ids } } }) : [];
  const byId = new Map(originals.map((o) => [o.id, o]));
  return rows.map((r) => {
    const dto = dmRowToDto(r);
    if (r.replyToId) {
      const o = byId.get(r.replyToId);
      dto.replyTo = o ? replyRefOf(o) : { id: r.replyToId, deleted: true };
    }
    return dto;
  });
}

export async function toDto(row: DirectMessage): Promise<DirectMessageDTO> {
  const [dto] = await toDtos([row]);
  return dto;
}

/** Условие выборки: сообщение не скрыто пользователем у себя. */
function visibleTo(userId: string) {
  return { NOT: { hiddenFor: { has: userId } } };
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
      ...visibleTo(userId),
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
  replyToId?: string,
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
  // Ответить можно только на сообщение этой же переписки: чужой id из
  // другого диалога раскрыл бы его содержимое в цитате.
  const replyTo = replyToId
    ? await prisma.directMessage.findFirst({ where: { id: replyToId, conversationId: conv.id }, select: { id: true } })
    : null;
  const message = await prisma.directMessage.create({
    data: {
      conversationId: conv.id,
      senderId: meId,
      body,
      ...(replyTo ? { replyToId: replyTo.id } : {}),
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
    message: await toDto(message),
    sender: me ? toPublicUser(me) : { id: meId, publicId: meId, username: '', avatarSeed: '', avatarUrl: null, kind: 'user' },
    recipient: { id: peer.id, publicId: peer.publicId, username: peer.username, avatarSeed: peer.avatarSeed, avatarUrl: peer.avatarUrl, kind: 'user' },
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
  return { message: await toDto(m), userAId: m.conversation.userAId, userBId: m.conversation.userBId };
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

const INVITE_TTL_MS = 30 * 60 * 1000;

export interface RoomInviteCardResult {
  conversationId: string;
  message: DirectMessageDTO;
  sender: PublicUser;
  recipient: PublicUser;
  /** true — создана новая карточка; false — обновлена существующая pending. */
  isNew: boolean;
}

/**
 * Отправить (или обновить существующую pending) карточку-приглашение в
 * комнату `room` от `meId` к `peerId`. Повторное приглашение той же пары в ту
 * же комнату, пока предыдущее ещё pending, обновляет снапшот на месте —
 * новой записи не создаётся.
 */
export async function createOrUpdateRoomInviteCard(
  meId: string,
  peerId: string,
  room: Room,
  token: string,
): Promise<RoomInviteCardResult> {
  const peer = await loadPeerOrThrow(peerId);
  const elig = await checkEligibility(meId, peer);
  if (!elig.canMessage) {
    const text =
      elig.reason === 'blocked'
        ? 'Вы не можете писать этому пользователю'
        : elig.reason === 'privacy'
          ? 'Пользователь ограничил, кто может ему писать'
          : 'Нельзя отправить приглашение';
    throw new DmError(elig.reason, text);
  }

  const conv = await getOrCreateConversation(meId, peerId);
  const { videoPoster, videoTitle } = videoCardInfo(room);

  const existing = await prisma.directMessage.findFirst({
    where: { conversationId: conv.id, inviteRoomId: room.id, inviteStatus: 'pending' },
    orderBy: { createdAt: 'desc' },
  });

  const snapshot = {
    inviteRoomSlug: room.slug,
    inviteRoomName: room.name,
    inviteVideoTitle: videoTitle,
    inviteVideoPoster: videoPoster,
    inviteToken: token,
  };

  let row: DirectMessage;
  const isNew = !existing;
  if (existing) {
    row = await prisma.directMessage.update({ where: { id: existing.id }, data: snapshot });
  } else {
    row = await prisma.directMessage.create({
      data: {
        conversationId: conv.id,
        senderId: meId,
        body: '🎬 Приглашение в комнату',
        inviteRoomId: room.id,
        inviteStatus: 'pending',
        ...snapshot,
      },
    });
    await prisma.conversation.update({
      where: { id: conv.id },
      data: { lastMessageAt: row.createdAt, [myReadField(conv, meId)]: row.createdAt },
    });
  }

  const me = await prisma.user.findUnique({ where: { id: meId }, select: PUBLIC_USER_SELECT });
  return {
    conversationId: conv.id,
    message: dmRowToDto(row),
    sender: me ? toPublicUser(me) : { id: meId, publicId: meId, username: '', avatarSeed: '', avatarUrl: null, kind: 'user' },
    recipient: { id: peer.id, publicId: peer.publicId, username: peer.username, avatarSeed: peer.avatarSeed, avatarUrl: peer.avatarUrl, kind: 'user' },
    isNew,
  };
}

/**
 * Живая синхронизация снапшота «что играет» у всех активных (pending, не
 * истёкших) карточек-приглашений в комнату `roomId`. Возвращает данные для
 * рассылки обновления обоим участникам каждой карточки (пустой массив — нечего
 * обновлять). Вызывается при смене видео в комнате, пока приглашение висит.
 */
export async function syncRoomInviteSnapshots(
  roomId: string,
  videoTitle: string | null,
  videoPoster: string | null,
): Promise<VideoNoteBroadcast[]> {
  const rows = await prisma.directMessage.findMany({
    where: { inviteRoomId: roomId, inviteStatus: 'pending' },
    include: { conversation: { select: { userAId: true, userBId: true } } },
  });
  const cutoff = Date.now() - INVITE_TTL_MS;
  const active = rows.filter((r) => r.createdAt.getTime() >= cutoff);
  if (active.length === 0) return [];

  await prisma.directMessage.updateMany({
    where: { id: { in: active.map((r) => r.id) } },
    data: { inviteVideoTitle: videoTitle, inviteVideoPoster: videoPoster },
  });

  return active.map((r) => ({
    message: dmRowToDto({ ...r, inviteVideoTitle: videoTitle, inviteVideoPoster: videoPoster }),
    userAId: r.conversation.userAId,
    userBId: r.conversation.userBId,
  }));
}

/**
 * Живая инфо-сводка комнаты для попапа по тапу на карточку. Доступна только
 * участникам диалога, в котором висит приглашение. Если комната удалена —
 * возвращает `available:false` со снапшотными данными карточки.
 */
export async function getRoomInviteInfo(meId: string, messageId: string): Promise<RoomInviteInfoResponse | null> {
  const m = await prisma.directMessage.findUnique({
    where: { id: messageId },
    include: { conversation: { select: { userAId: true, userBId: true } } },
  });
  if (!m || !m.inviteRoomId) return null;
  if (m.conversation.userAId !== meId && m.conversation.userBId !== meId) return null;

  const room = await getRoomById(m.inviteRoomId);
  if (!room) {
    return {
      roomName: m.inviteRoomName ?? 'Комната',
      slug: null,
      videoTitle: m.inviteVideoTitle,
      videoPoster: m.inviteVideoPoster,
      ownerUsername: '',
      participantCount: 0,
      maxParticipants: 0,
      available: false,
    };
  }
  const { videoTitle, videoPoster } = videoCardInfo(room);
  return {
    roomName: room.name,
    slug: room.slug,
    videoTitle,
    videoPoster,
    ownerUsername: room.owner.username,
    participantCount: roomStore.get(room.id)?.participants.size ?? 0,
    maxParticipants: room.maxParticipants,
    available: true,
  };
}

export type RespondRoomInviteResult =
  | { kind: 'accepted'; redirect: { slug: string; inviteToken: string }; broadcast: VideoNoteBroadcast }
  | { kind: 'declined'; broadcast: VideoNoteBroadcast }
  | { kind: 'expired'; broadcast: VideoNoteBroadcast }
  | { kind: 'blocked'; reason: 'full' | 'closed'; message: string }
  | { kind: 'invalid'; message: string };

/**
 * Ответ получателя на карточку-приглашение. `accept` реально проверяет
 * доступность комнаты через тот же `authorizeJoin`, что и штатный вход —
 * сам вход (WS-тикет, регистрация участника) клиент затем выполняет обычным
 * путём через `Room.tsx` по возвращённому `redirect`.
 */
export async function respondRoomInvite(
  meId: string,
  messageId: string,
  action: 'accept' | 'decline',
): Promise<RespondRoomInviteResult> {
  const m = await prisma.directMessage.findUnique({
    where: { id: messageId },
    include: { conversation: { select: { userAId: true, userBId: true } } },
  });
  if (!m || !m.inviteRoomId) return { kind: 'invalid', message: 'Приглашение не найдено' };
  const isParticipant = m.conversation.userAId === meId || m.conversation.userBId === meId;
  if (!isParticipant || m.senderId === meId) return { kind: 'invalid', message: 'Нет доступа к приглашению' };
  if (m.inviteStatus !== 'pending') return { kind: 'invalid', message: 'Приглашение уже неактивно' };

  if (Date.now() - m.createdAt.getTime() > INVITE_TTL_MS) {
    await prisma.directMessage.update({ where: { id: m.id }, data: { inviteStatus: 'expired' } });
    const broadcast = await loadForBroadcast(m.id);
    return broadcast ? { kind: 'expired', broadcast } : { kind: 'invalid', message: 'Приглашение истекло' };
  }

  if (action === 'decline') {
    await prisma.directMessage.update({ where: { id: m.id }, data: { inviteStatus: 'declined' } });
    const broadcast = await loadForBroadcast(m.id);
    return broadcast ? { kind: 'declined', broadcast } : { kind: 'invalid', message: 'Приглашение не найдено' };
  }

  try {
    const room = await authorizeJoin(
      m.inviteRoomSlug ?? '',
      { userId: meId, isGuest: false },
      undefined,
      m.inviteToken ?? undefined,
    );
    await prisma.directMessage.update({ where: { id: m.id }, data: { inviteStatus: 'accepted' } });
    const broadcast = await loadForBroadcast(m.id);
    if (!broadcast) return { kind: 'invalid', message: 'Приглашение не найдено' };
    return { kind: 'accepted', redirect: { slug: room.slug, inviteToken: m.inviteToken ?? '' }, broadcast };
  } catch (err) {
    if (err instanceof RoomServiceError) {
      if (err.status === 404) return { kind: 'blocked', reason: 'closed', message: 'Комната больше недоступна' };
      if (err.status === 409) return { kind: 'blocked', reason: 'full', message: 'Комната заполнена' };
    }
    return { kind: 'blocked', reason: 'closed', message: 'Не удалось подключиться к комнате' };
  }
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
  // Момент прочтения каждого сообщения — один раз, при первом прочтении:
  // отметка по диалогу дальше сдвигается, и по ней уже не восстановить,
  // когда прочитали конкретную реплику.
  await prisma.directMessage.updateMany({
    where: { conversationId: conv.id, senderId: peerId, readAt: null, createdAt: { lte: now } },
    data: { readAt: now },
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
  /** Момент первого прослушивания. */
  playedAt: string;
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
  const playedAt = m.voicePlayedAt ?? new Date();
  if (!m.voicePlayedAt) {
    await prisma.directMessage.update({ where: { id: m.id }, data: { voicePlayedAt: playedAt } });
  }
  return { conversationId: m.conversationId, messageId: m.id, senderId: m.senderId, playedAt: playedAt.toISOString() };
}

/**
 * Отметить видео-кружок просмотренным. Правила те же, что у голосового:
 * только получатель, только в своём диалоге, повторный вызов момент не
 * перезаписывает.
 */
export async function markVideoPlayed(meId: string, messageId: string): Promise<VoicePlayedResult | null> {
  const m = await prisma.directMessage.findUnique({
    where: { id: messageId },
    include: { conversation: { select: { userAId: true, userBId: true } } },
  });
  if (!m || !m.videoStatus) return null;
  const isParticipant = m.conversation.userAId === meId || m.conversation.userBId === meId;
  if (!isParticipant || m.senderId === meId) return null; // только получатель
  const playedAt = m.videoPlayedAt ?? new Date();
  if (!m.videoPlayedAt) {
    await prisma.directMessage.update({ where: { id: m.id }, data: { videoPlayedAt: playedAt } });
  }
  return { conversationId: m.conversationId, messageId: m.id, senderId: m.senderId, playedAt: playedAt.toISOString() };
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
      messages: { where: visibleTo(userId), orderBy: { createdAt: 'desc' }, take: 1 },
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
        // videoUrl появляется только после транскода (ready) — статус же
        // проставляется сразу при создании сообщения (processing), поэтому
        // маркер должен опираться на него, а не ждать готового файла.
        hasVideo: !!last.videoStatus,
        hasRoomInvite: !!last.inviteRoomId,
        hasCall: !!last.callId,
        ...(last.callOutcome
          ? { callOutcome: last.callOutcome as 'completed' | 'missed' | 'declined' | 'cancelled' | 'failed' }
          : {}),
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
  pinned: DirectMessageDTO | null;
}

/**
 * Тред переписки с пользователем по username. `before` — ISO-время, до которого
 * грузить более старые сообщения (пагинация «раньше»). Диалог НЕ создаётся при
 * чтении — только при первой отправке. Статус сети/«был в сети»/пол отдаются
 * с тем же гейтингом приватности, что и в публичном профиле.
 */
export async function getThreadByPublicId(
  meId: string,
  publicId: string,
  before?: string,
): Promise<ThreadResult> {
  const u = await prisma.user.findUnique({
    where: { publicId },
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
      pinned: null,
    };
  }

  const rows = await prisma.directMessage.findMany({
    where: {
      conversationId: conv.id,
      ...visibleTo(meId),
      ...(before ? { createdAt: { lt: new Date(before) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: DM_PAGE + 1,
  });
  const hasMore = rows.length > DM_PAGE;
  const page = rows.slice(0, DM_PAGE).reverse();

  const peerRead = conv.userAId === u.id ? conv.aLastReadAt : conv.bLastReadAt;
  // Закреп общий, но скрытое у себя сообщение в полосе закрепа не показываем.
  const pinnedRow = conv.pinnedMessageId
    ? await prisma.directMessage.findFirst({
        where: { id: conv.pinnedMessageId, conversationId: conv.id, ...visibleTo(meId) },
      })
    : null;

  return {
    conversationId: conv.id,
    peer,
    messages: await toDtos(page),
    hasMore,
    peerLastReadAt: peerRead ? peerRead.toISOString() : null,
    online,
    peerLastSeenAt,
    peerGender,
    eligibility,
    pinned: pinnedRow ? await toDto(pinnedRow) : null,
  };
}

/** Сколько записей о звонках отдаём за раз. */
const CALLS_PAGE = 40;

/**
 * История звонков по всем диалогам сразу.
 *
 * Записи о звонках лежат обычными сообщениями с проставленным `callId` —
 * отдельной таблицы у них нет. Разделу «Звонки» нужен сквозной список, поэтому
 * выбираем их по всем диалогам пользователя одним запросом, а не собираем на
 * клиенте из открытых переписок: так в списке будут и те разговоры, чью
 * переписку ни разу не открывали.
 */
export async function listCallHistory(
  meId: string,
  before?: string,
): Promise<{ calls: CallHistoryEntry[]; hasMore: boolean }> {
  const beforeDate = before ? new Date(before) : null;
  const rows = await prisma.directMessage.findMany({
    where: {
      callId: { not: null },
      conversation: { OR: [{ userAId: meId }, { userBId: meId }] },
      ...(beforeDate && !Number.isNaN(beforeDate.getTime()) ? { createdAt: { lt: beforeDate } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: CALLS_PAGE + 1,
    include: {
      conversation: {
        select: {
          userA: { select: PUBLIC_USER_SELECT },
          userB: { select: PUBLIC_USER_SELECT },
        },
      },
    },
  });

  const hasMore = rows.length > CALLS_PAGE;
  const calls = rows.slice(0, CALLS_PAGE).map((m) => {
    // Отправителем записи всегда числится звонивший — по нему и определяется
    // направление, отдельного поля для этого не нужно.
    const outgoing = m.senderId === meId;
    const a = m.conversation.userA;
    const b = m.conversation.userB;
    const peer = a.id === meId ? b : a;
    return {
      id: m.id,
      peer: toPublicUser(peer),
      direction: outgoing ? 'outgoing' : 'incoming',
      kind: m.callKind === 'video' ? 'video' : 'audio',
      outcome: (m.callOutcome ?? 'completed') as CallHistoryEntry['outcome'],
      durationSec: m.callDurationSec ?? 0,
      createdAt: m.createdAt.toISOString(),
    } satisfies CallHistoryEntry;
  });

  return { calls, hasMore };
}

// ── Действия над сообщениями: правка, удаление, закреп, пересылка ─────────

function isParticipant(conv: Pick<Conversation, 'userAId' | 'userBId'>, userId: string): boolean {
  return conv.userAId === userId || conv.userBId === userId;
}

/** Результат, который нужно разослать обоим участникам диалога. */
export interface ConversationBroadcast<T> {
  conversationId: string;
  userAId: string;
  userBId: string;
  payload: T;
}

/**
 * Изменить текст своего сообщения. Голосовые, кружки, приглашения, записи о
 * звонках и пересланное не редактируются: у первых нечего править, а
 * пересланное — чужие слова.
 */
export async function editMessage(
  meId: string,
  messageId: string,
  rawBody: string,
): Promise<ConversationBroadcast<DirectMessageDTO> | null> {
  const m = await prisma.directMessage.findUnique({ where: { id: messageId }, include: { conversation: true } });
  if (!m || !isParticipant(m.conversation, meId) || m.hiddenFor.includes(meId)) {
    throw new DmError('not_found', 'Сообщение не найдено');
  }
  if (m.senderId !== meId) throw new DmError('ok', 'Изменить можно только своё сообщение');
  if (m.voiceUrl || m.videoStatus || m.inviteRoomId || m.callId || m.forwardedFromId) {
    throw new DmError('ok', 'Это сообщение нельзя изменить');
  }
  const body = rawBody.trim();
  // У снимка подпись можно стереть целиком, у текста — нет: пустое сообщение
  // без вложения не отличить от удалённого.
  if (!body && !m.imageUrl) throw new DmError('ok', 'Сообщение не может быть пустым');
  if (body.length > MAX_DM_BODY) throw new DmError('ok', 'Сообщение слишком длинное');
  if (body === m.body) return null;

  const row = await prisma.directMessage.update({
    where: { id: m.id },
    data: { body, editedAt: new Date() },
  });
  return {
    conversationId: m.conversationId,
    userAId: m.conversation.userAId,
    userBId: m.conversation.userBId,
    payload: await toDto(row),
  };
}

export interface DeleteResult {
  conversationId: string;
  userAId: string;
  userBId: string;
  messageIds: string[];
  forAll: boolean;
  /** Удалённое было закреплено — закреп снят у обоих. */
  unpinned: boolean;
}

/** Больше за один раз не удаляем и не пересылаем — режим выделения не бесконечен. */
const MAX_BATCH = 200;

/**
 * Удалить сообщения одного диалога. Для всех — строка исчезает у обоих (в
 * личной переписке это можно сделать с любым сообщением, не только своим);
 * только у себя — сообщение скрывается для удалившего.
 */
export async function deleteMessages(
  meId: string,
  messageIds: string[],
  forAll: boolean,
): Promise<DeleteResult | null> {
  const ids = [...new Set(messageIds)].slice(0, MAX_BATCH);
  if (!ids.length) return null;
  const rows = await prisma.directMessage.findMany({
    where: { id: { in: ids } },
    include: { conversation: true },
  });
  const conv = rows[0]?.conversation;
  if (!conv || !isParticipant(conv, meId)) return null;
  // Одна пачка — один диалог: строки из других переписок отбрасываем.
  const own = rows.filter((r) => r.conversationId === conv.id && !r.hiddenFor.includes(meId));
  if (!own.length) return null;
  const okIds = own.map((r) => r.id);

  if (forAll) {
    // Файлы вложений не трогаем: пересланные копии ссылаются на те же файлы.
    await prisma.directMessage.deleteMany({ where: { id: { in: okIds } } });
  } else {
    await prisma.$transaction(
      own.map((r) =>
        prisma.directMessage.update({ where: { id: r.id }, data: { hiddenFor: { push: meId } } }),
      ),
    );
  }

  const unpinned = forAll && conv.pinnedMessageId != null && okIds.includes(conv.pinnedMessageId);
  if (unpinned) {
    await prisma.conversation.update({ where: { id: conv.id }, data: { pinnedMessageId: null } });
  }
  return { conversationId: conv.id, userAId: conv.userAId, userBId: conv.userBId, messageIds: okIds, forAll, unpinned };
}

/** Закрепить сообщение в диалоге с `peerId` (или открепить при `messageId = null`). */
export async function pinMessage(
  meId: string,
  peerId: string,
  messageId: string | null,
): Promise<ConversationBroadcast<DirectMessageDTO | null> | null> {
  const { aId, bId } = pair(meId, peerId);
  const conv = await prisma.conversation.findUnique({
    where: { userAId_userBId: { userAId: aId, userBId: bId } },
  });
  if (!conv) return null;
  const row = messageId
    ? await prisma.directMessage.findFirst({ where: { id: messageId, conversationId: conv.id, ...visibleTo(meId) } })
    : null;
  if (messageId && !row) return null;
  await prisma.conversation.update({ where: { id: conv.id }, data: { pinnedMessageId: row?.id ?? null } });
  return {
    conversationId: conv.id,
    userAId: conv.userAId,
    userBId: conv.userBId,
    payload: row ? await toDto(row) : null,
  };
}

export interface ForwardResult {
  conversationId: string;
  messages: DirectMessageDTO[];
  sender: PublicUser;
  recipient: PublicUser;
}

/**
 * Переслать сообщения пользователю `toUserId` — в любой диалог, включая тот
 * же самый. Копируется содержимое, а не ссылка: у получателя это обычные
 * сообщения с пометкой, чьи они. Звонки и приглашения не пересылаются, как и
 * кружок, который ещё не дотранскодирован.
 */
export async function forwardMessages(
  meId: string,
  toUserId: string,
  messageIds: string[],
): Promise<ForwardResult | null> {
  const ids = [...new Set(messageIds)].slice(0, MAX_BATCH);
  if (!ids.length) return null;
  const rows = await prisma.directMessage.findMany({
    where: {
      id: { in: ids },
      ...visibleTo(meId),
      conversation: { OR: [{ userAId: meId }, { userBId: meId }] },
    },
    orderBy: { createdAt: 'asc' },
  });
  const sendable = rows.filter(
    (r) => !r.callId && !r.inviteRoomId && (!r.videoStatus || r.videoStatus === 'ready'),
  );
  if (!sendable.length) return null;

  const peer = await loadPeerOrThrow(toUserId);
  const elig = await checkEligibility(meId, peer);
  if (!elig.canMessage) {
    throw new DmError(
      elig.reason,
      elig.reason === 'blocked'
        ? 'Вы не можете писать этому пользователю'
        : elig.reason === 'privacy'
          ? 'Пользователь ограничил, кто может ему писать'
          : 'Нельзя переслать сообщение',
    );
  }

  const conv = await getOrCreateConversation(meId, toUserId);
  const authorIds = [...new Set(sendable.map((r) => r.forwardedFromId ?? r.senderId))];
  const authors = await prisma.user.findMany({
    where: { id: { in: authorIds } },
    select: { id: true, username: true },
  });
  const nameOf = new Map(authors.map((a) => [a.id, a.username]));

  // Время растёт на миллисекунду: у пачки один момент отправки, а порядок
  // в ленте должен остаться таким, как у оригиналов.
  const base = Date.now();
  const created = await prisma.$transaction(
    sendable.map((r, i) => {
      const authorId = r.forwardedFromId ?? r.senderId;
      return prisma.directMessage.create({
        data: {
          conversationId: conv.id,
          senderId: meId,
          body: r.body,
          imageUrl: r.imageUrl,
          imageWidth: r.imageWidth,
          imageHeight: r.imageHeight,
          voiceUrl: r.voiceUrl,
          voiceDurationSec: r.voiceDurationSec,
          voicePeaksJson: r.voicePeaksJson,
          videoUrl: r.videoUrl,
          videoThumbUrl: r.videoThumbUrl,
          videoDurationSec: r.videoDurationSec,
          videoStatus: r.videoStatus,
          forwardedFromId: authorId,
          forwardedFromName: r.forwardedFromName ?? nameOf.get(authorId) ?? '',
          createdAt: new Date(base + i),
        },
      });
    }),
  );
  const last = created[created.length - 1];
  await prisma.conversation.update({
    where: { id: conv.id },
    data: { lastMessageAt: last.createdAt, [myReadField(conv, meId)]: last.createdAt },
  });

  const me = await prisma.user.findUnique({ where: { id: meId }, select: PUBLIC_USER_SELECT });
  return {
    conversationId: conv.id,
    messages: await toDtos(created),
    sender: me
      ? toPublicUser(me)
      : { id: meId, publicId: meId, username: '', avatarSeed: '', avatarUrl: null, kind: 'user' },
    recipient: {
      id: peer.id,
      publicId: peer.publicId,
      username: peer.username,
      avatarSeed: peer.avatarSeed,
      avatarUrl: peer.avatarUrl,
      kind: 'user',
    },
  };
}
