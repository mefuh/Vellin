import type { PublicUser } from '@vellin/shared';
import { prisma } from '../db/prisma.js';
import { userHub } from '../realtime/UserHub.js';
import { removeNotifications } from '../realtime/notify.js';
import { toAppNotification } from '../friends/mappers.js';
import { logger } from '../utils/logger.js';
import { DmError, markRead, sendMessage, unreadTotal } from './service.js';

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

/** Обработать отправку ЛС: персист + доставка обоим + колокольчик получателю. */
export async function handleDmSend(
  senderId: string,
  toUserId: string,
  body: string,
  nonce: string,
): Promise<void> {
  try {
    const res = await sendMessage(senderId, toUserId, body);
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
    await pushDmNotification(toUserId, res.sender, res.conversationId, body);
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
    // Диалог прочитан — убираем его уведомление из колокольчика.
    await removeNotifications(meId, { type: 'direct_message', actorId: peerId });
  } catch (err) {
    logger.error({ err, meId, peerId }, 'dm read failed');
  }
}

/** Транзиентный сигнал «печатаю» — просто реле собеседнику. */
export function handleDmTyping(meId: string, toUserId: string, typing: boolean): void {
  userHub.pushTo(toUserId, { t: 'dm_typing', conversationId: '', fromUserId: meId, typing });
}
