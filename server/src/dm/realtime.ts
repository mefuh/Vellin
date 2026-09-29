import type { DirectMessageDTO, PublicUser } from '@vellin/shared';
import { prisma } from '../db/prisma.js';
import { userHub } from '../realtime/UserHub.js';
import { isToggleEnabled } from '../admin/platform/gate.js';
import { removeNotifications } from '../realtime/notify.js';
import { toAppNotification, PUBLIC_USER_SELECT, toPublicUser } from '../friends/mappers.js';
import { logger } from '../utils/logger.js';
import { notifyAsync } from '../push/notificationService.js';
import { dmPushPreview } from '../push/payloads.js';
import { resetDmCount } from '../push/grouping.js';
import {
  DmError,
  deleteMessages,
  editMessage,
  forwardMessages,
  isConversationMuted,
  pinMessage,
  reactToMessage,
  markRead,
  markVideoPlayed,
  markVoicePlayed,
  sendMessage,
  syncRoomInviteSnapshots,
  unreadTotal,
  type SendImage,
  type SendVoice,
  type SendVideoNote,
  type VideoNoteBroadcast,
  type RoomInviteCardResult,
} from './service.js';
import { promoteRawToMessage, deleteRawUpload } from './videoNote.js';
import { enqueueTranscode } from './videoTranscode.js';

function parseDmCount(json: string): number {
  try {
    const v = JSON.parse(json) as { count?: unknown };
    return typeof v.count === 'number' ? v.count : 0;
  } catch {
    return 0;
  }
}

/**
 * Колокольчик: одно коалесцированное уведомление о новых ЛС на собеседника.
 * Повторные сообщения от того же отправителя обновляют существующее (счётчик +
 * превью + время), а не плодят новые записи. Снимается при прочтении диалога.
 */
async function pushDmNotification(
  recipientId: string,
  sender: PublicUser,
  conversationId: string,
  body: string,
): Promise<void> {
  const preview = body.trim().slice(0, 80);
  const existing = await prisma.notification.findFirst({
    where: { userId: recipientId, type: 'direct_message', actorId: sender.id },
    orderBy: { createdAt: 'desc' },
  });
  const data = (count: number): string => JSON.stringify({ conversationId, preview, count });

  const row = existing
    ? await prisma.notification.update({
        where: { id: existing.id },
        data: { dataJson: data(parseDmCount(existing.dataJson) + 1), readAt: null, createdAt: new Date() },
      })
    : await prisma.notification.create({
        data: { userId: recipientId, type: 'direct_message', actorId: sender.id, dataJson: data(1) },
      });

  const notification = await toAppNotification(row);
  const unreadCount = await prisma.notification.count({ where: { userId: recipientId, readAt: null } });
  userHub.pushTo(recipientId, { t: 'notification', notification, unreadCount });
}

/**
 * Рассылка обновления видеосообщения обоим участникам (по завершении транскода):
 * подменяет processing→ready в баблах. Внедряется в транскод-воркер через DI.
 */
export async function broadcastVideoNoteUpdate(b: VideoNoteBroadcast): Promise<void> {
  const [ua, ub] = await Promise.all([
    prisma.user.findUnique({ where: { id: b.userAId }, select: PUBLIC_USER_SELECT }),
    prisma.user.findUnique({ where: { id: b.userBId }, select: PUBLIC_USER_SELECT }),
  ]);
  if (!ua || !ub) return;
  const peerA = toPublicUser(ub); // собеседник для userA
  const peerB = toPublicUser(ua); // собеседник для userB
  userHub.pushTo(b.userAId, { t: 'dm_message_updated', message: b.message, peer: peerA });
  userHub.pushTo(b.userBId, { t: 'dm_message_updated', message: b.message, peer: peerB });
}

/** Обновление статуса карточки-приглашения (принято/отклонено/истекло) — переиспользует тот же контракт. */
export const broadcastRoomInviteUpdate = broadcastVideoNoteUpdate;

/**
 * Живая синхронизация карточек-приглашений при смене видео в комнате: обновляет
 * снапшот «что играет» у всех активных приглашений и рассылает обновление обоим
 * участникам каждой карточки. Внедряется в UserHub через DI (см. app.ts).
 */
export function syncRoomInviteCards(p: { roomId: string; videoPoster: string | null; videoTitle: string | null }): void {
  void syncRoomInviteSnapshots(p.roomId, p.videoTitle, p.videoPoster)
    .then((broadcasts) => {
      for (const b of broadcasts) void broadcastRoomInviteUpdate(b);
    })
    .catch((err) => logger.error({ err, roomId: p.roomId }, 'room invite live-sync failed'));
}

/** Рассылка новой (или обновлённой существующей pending) карточки-приглашения обоим участникам. */
export async function broadcastRoomInviteCard(res: RoomInviteCardResult): Promise<void> {
  if (!res.isNew) {
    // Повторное приглашение — карточка та же, просто обновились снапшот-поля.
    userHub.pushTo(res.recipient.id, { t: 'dm_message_updated', message: res.message, peer: res.sender });
    userHub.pushTo(res.sender.id, { t: 'dm_message_updated', message: res.message, peer: res.recipient });
    return;
  }
  const [recipUnread, senderUnread] = await Promise.all([
    unreadTotal(res.recipient.id),
    unreadTotal(res.sender.id),
  ]);
  userHub.pushTo(res.recipient.id, {
    t: 'dm_message',
    message: res.message,
    peer: res.sender,
    unreadTotal: recipUnread,
  });
  userHub.pushTo(res.sender.id, {
    t: 'dm_message',
    message: res.message,
    peer: res.recipient,
    unreadTotal: senderUnread,
  });
  await pushDmNotification(res.recipient.id, res.sender, res.conversationId, '🎬 Приглашение в комнату');
}

/** Обработать отправку ЛС: персист + доставка обоим + колокольчик получателю. */
export async function handleDmSend(
  senderId: string,
  toUserId: string,
  body: string,
  nonce: string,
  images: SendImage[] = [],
  voice?: SendVoice,
  video?: SendVideoNote,
  replyToId?: string,
): Promise<void> {
  if (!(await isToggleEnabled('directMessages'))) {
    userHub.pushTo(senderId, { t: 'dm_error', nonce, reason: 'ok', message: 'Личные сообщения временно отключены администратором' });
    return;
  }
  try {
    const res = await sendMessage(senderId, toUserId, body, images, voice, video, replyToId);
    // Видео: привязать сырой файл к сообщению и поставить в очередь транскода.
    if (video) {
      const ok = await promoteRawToMessage(video.uploadId, res.message.id, video.mirrored);
      if (ok) enqueueTranscode(res.message.id);
      else await deleteRawUpload(video.uploadId).catch(() => {});
    }
    const [recipUnread, senderUnread] = await Promise.all([
      unreadTotal(toUserId),
      unreadTotal(senderId),
    ]);
    // Получателю — собеседник для него это отправитель.
    userHub.pushTo(toUserId, {
      t: 'dm_message',
      message: res.message,
      peer: res.sender,
      unreadTotal: recipUnread,
    });
    // Эхо отправителю (с nonce для сопоставления оптимистичной отправки).
    userHub.pushTo(senderId, {
      t: 'dm_message',
      message: { ...res.message, nonce },
      peer: res.recipient,
      unreadTotal: senderUnread,
    });
    const preview =
      body.trim() ||
      (images.length > 1 ? `📷 Фото (${images.length})` : images.length ? '📷 Фото' : voice ? '🎤 Голосовое сообщение' : video ? '🎥 Видеосообщение' : '');
    // Диалог с выключенными уведомлениями: сообщение доставлено и в списке
    // видно, но колокольчик, звук и всплывающее окно молчат.
    if (!(await isConversationMuted(res.conversationId, toUserId))) {
      await pushDmNotification(toUserId, res.sender, res.conversationId, preview);
      // Web-Push получателю — но НЕ если он прямо сейчас читает этот же диалог
      // (видимая вкладка + открыт именно он). Прочее гейтится настройками внутри.
      if (!userHub.isViewingConversation(toUserId, res.conversationId)) {
        notifyAsync(toUserId, 'direct_message', {
          username: res.sender.username,
          publicId: res.sender.publicId,
          message: dmPushPreview(body, images.length > 0, !!voice, !!video),
          conversationId: res.conversationId,
        });
      }
    }
  } catch (err) {
    if (err instanceof DmError) {
      userHub.pushTo(senderId, { t: 'dm_error', nonce, reason: err.reason, message: err.message });
      return;
    }
    logger.error({ err, senderId, toUserId }, 'dm send failed');
    userHub.pushTo(senderId, { t: 'dm_error', nonce, reason: 'ok', message: 'Не удалось отправить сообщение' });
  }
}

/** Отметить переписку прочитанной: бейдж себе, галочки собеседнику, чистка белла. */
export async function handleDmRead(meId: string, peerId: string): Promise<void> {
  try {
    const r = await markRead(meId, peerId);
    if (!r) return;
    // Мои остальные вкладки: сбросить непрочитанные + бейдж.
    userHub.pushTo(meId, {
      t: 'dm_read',
      conversationId: r.conversationId,
      byUserId: meId,
      readAt: r.readAt,
      unreadTotal: r.unreadTotal,
    });
    // Собеседнику: обновить «галочки» на его сообщениях.
    userHub.pushTo(peerId, {
      t: 'dm_read',
      conversationId: r.conversationId,
      byUserId: meId,
      readAt: r.readAt,
    });
    // Диалог прочитан — убираем его уведомление из колокольчика и сбрасываем
    // счётчик группировки push (следующая серия начнётся заново).
    await removeNotifications(meId, { type: 'direct_message', actorId: peerId });
    resetDmCount(meId, r.conversationId);
  } catch (err) {
    logger.error({ err, meId, peerId }, 'dm read failed');
  }
}

/** Получатель прослушал голосовое — уведомить автора (индикатор «прослушано»). */
export async function handleDmVoicePlayed(meId: string, messageId: string): Promise<void> {
  try {
    const r = await markVoicePlayed(meId, messageId);
    if (!r) return;
    userHub.pushTo(r.senderId, {
      t: 'dm_voice_played',
      conversationId: r.conversationId,
      messageId: r.messageId,
      playedAt: r.playedAt,
    });
  } catch (err) {
    logger.error({ err, meId, messageId }, 'dm voice played failed');
  }
}

/** Получатель посмотрел кружок — уведомить автора (индикатор «просмотрено»). */
export async function handleDmVideoPlayed(meId: string, messageId: string): Promise<void> {
  try {
    const r = await markVideoPlayed(meId, messageId);
    if (!r) return;
    userHub.pushTo(r.senderId, {
      t: 'dm_video_played',
      conversationId: r.conversationId,
      messageId: r.messageId,
      playedAt: r.playedAt,
    });
  } catch (err) {
    logger.error({ err, meId, messageId }, 'dm video played failed');
  }
}

/** Транзиентный сигнал «печатаю/записываю голосовое/кружок» — просто реле собеседнику. */
export function handleDmTyping(meId: string, toUserId: string, typing: boolean, kind: 'text' | 'voice' | 'video' = 'text'): void {
  userHub.pushTo(toUserId, { t: 'dm_typing', conversationId: '', fromUserId: meId, typing, kind });
}

/** Сообщение пары глазами каждого из участников: собеседник у каждого свой. */
async function pushUpdatedToBoth(
  userAId: string,
  userBId: string,
  message: DirectMessageDTO,
): Promise<void> {
  await broadcastVideoNoteUpdate({ message, userAId, userBId });
}

/** Изменить своё сообщение: обновлённый текст и отметка «изменено» — обоим. */
export async function handleDmEdit(meId: string, messageId: string, body: string): Promise<void> {
  try {
    const r = await editMessage(meId, messageId, body);
    if (!r) return;
    await pushUpdatedToBoth(r.userAId, r.userBId, r.payload);
  } catch (err) {
    if (err instanceof DmError) {
      userHub.pushTo(meId, { t: 'dm_error', reason: err.reason, message: err.message });
      return;
    }
    logger.error({ err, meId, messageId }, 'dm edit failed');
  }
}

/** Удалить сообщения: для всех — обоим участникам, у себя — только своим вкладкам. */
export async function handleDmDelete(meId: string, messageIds: string[], forAll: boolean): Promise<void> {
  try {
    const r = await deleteMessages(meId, messageIds, forAll);
    if (!r) return;
    const event = {
      t: 'dm_message_deleted' as const,
      conversationId: r.conversationId,
      messageIds: r.messageIds,
      forAll: r.forAll,
    };
    if (r.forAll) {
      userHub.pushTo(r.userAId, event);
      userHub.pushTo(r.userBId, event);
    } else {
      userHub.pushTo(meId, event);
    }
    if (r.unpinned) {
      const pinned = { t: 'dm_pinned' as const, conversationId: r.conversationId, message: null, byUserId: meId };
      userHub.pushTo(r.userAId, pinned);
      userHub.pushTo(r.userBId, pinned);
    }
  } catch (err) {
    logger.error({ err, meId }, 'dm delete failed');
  }
}

/** Закрепить или открепить сообщение — закреп общий, видят оба. */
export async function handleDmPin(meId: string, peerId: string, messageId: string | null): Promise<void> {
  try {
    const r = await pinMessage(meId, peerId, messageId);
    if (!r) return;
    const event = { t: 'dm_pinned' as const, conversationId: r.conversationId, message: r.payload, byUserId: meId };
    userHub.pushTo(r.userAId, event);
    userHub.pushTo(r.userBId, event);
  } catch (err) {
    logger.error({ err, meId, peerId }, 'dm pin failed');
  }
}

/** Переслать сообщения: доставка как у обычной отправки, колокольчик — один на пачку. */
export async function handleDmForward(meId: string, toUserId: string, messageIds: string[]): Promise<void> {
  if (!(await isToggleEnabled('directMessages'))) {
    userHub.pushTo(meId, { t: 'dm_error', reason: 'ok', message: 'Личные сообщения временно отключены администратором' });
    return;
  }
  try {
    const r = await forwardMessages(meId, toUserId, messageIds);
    if (!r) return;
    const [recipUnread, senderUnread] = await Promise.all([unreadTotal(toUserId), unreadTotal(meId)]);
    // Себе в тот же диалог пересылать можно — тогда адресат и отправитель
    // совпадают, и второе эхо было бы дублем.
    const self = toUserId === meId;
    for (const message of r.messages) {
      if (!self) {
        userHub.pushTo(toUserId, { t: 'dm_message', message, peer: r.sender, unreadTotal: recipUnread });
      }
      userHub.pushTo(meId, { t: 'dm_message', message, peer: r.recipient, unreadTotal: senderUnread });
    }
    if (self) return;
    const preview =
      r.messages.length === 1 ? 'Пересланное сообщение' : `Пересланные сообщения: ${r.messages.length}`;
    if (await isConversationMuted(r.conversationId, toUserId)) return;
    await pushDmNotification(toUserId, r.sender, r.conversationId, preview);
    if (!userHub.isViewingConversation(toUserId, r.conversationId)) {
      notifyAsync(toUserId, 'direct_message', {
        username: r.sender.username,
        publicId: r.sender.publicId,
        message: preview,
        conversationId: r.conversationId,
      });
    }
  } catch (err) {
    if (err instanceof DmError) {
      userHub.pushTo(meId, { t: 'dm_error', reason: err.reason, message: err.message });
      return;
    }
    logger.error({ err, meId, toUserId }, 'dm forward failed');
  }
}

/** Реакция поставлена, заменена или снята — актуальный список обоим участникам. */
export async function handleDmReact(meId: string, messageId: string, emoji: string | null): Promise<void> {
  try {
    const r = await reactToMessage(meId, messageId, emoji);
    if (!r) return;
    const event = { t: 'dm_reaction' as const, conversationId: r.conversationId, messageId: r.messageId, reactions: r.reactions };
    userHub.pushTo(r.userAId, event);
    userHub.pushTo(r.userBId, event);
  } catch (err) {
    logger.error({ err, meId, messageId }, 'dm react failed');
  }
}
