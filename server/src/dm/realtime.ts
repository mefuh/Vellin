import type { PublicUser } from '@vellin/shared';
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
  markRead,
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
  image?: SendImage,
  voice?: SendVoice,
  video?: SendVideoNote,
): Promise<void> {
  if (!(await isToggleEnabled('directMessages'))) {
    userHub.pushTo(senderId, { t: 'dm_error', nonce, reason: 'ok', message: 'Личные сообщения временно отключены администратором' });
    return;
  }
  try {
    const res = await sendMessage(senderId, toUserId, body, image, voice, video);
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
      (image ? '📷 Фото' : voice ? '🎤 Голосовое сообщение' : video ? '🎥 Видеосообщение' : '');
    await pushDmNotification(toUserId, res.sender, res.conversationId, preview);
    // Web-Push получателю — но НЕ если он прямо сейчас читает этот же диалог
    // (видимая вкладка + открыт именно он). Прочее гейтится настройками внутри.
    if (!userHub.isViewingConversation(toUserId, res.conversationId)) {
      notifyAsync(toUserId, 'direct_message', {
        username: res.sender.username,
        publicId: res.sender.publicId,
        message: dmPushPreview(body, !!image, !!voice, !!video),
        conversationId: res.conversationId,
      });
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
    });
  } catch (err) {
    logger.error({ err, meId, messageId }, 'dm voice played failed');
  }
}

/** Транзиентный сигнал «печатаю/записываю голосовое/кружок» — просто реле собеседнику. */
export function handleDmTyping(meId: string, toUserId: string, typing: boolean, kind: 'text' | 'voice' | 'video' = 'text'): void {
  userHub.pushTo(toUserId, { t: 'dm_typing', conversationId: '', fromUserId: meId, typing, kind });
}
