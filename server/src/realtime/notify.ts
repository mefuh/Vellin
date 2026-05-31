import type { AppNotification, NotificationType } from '@vellin/shared';
import { prisma } from '../db/prisma.js';
import { toAppNotification } from '../friends/mappers.js';
import { userHub } from './UserHub.js';

interface NotificationData {
  roomSlug?: string;
  roomName?: string;
}

/**
 * Создать уведомление в БД и сразу доставить его получателю по
 * пользовательскому WS-каналу (если онлайн). Возвращает DTO.
 */
export async function createAndPush(
  recipientId: string,
  type: NotificationType,
  actorId: string | null,
  data: NotificationData = {},
): Promise<AppNotification> {
  const row = await prisma.notification.create({
    data: {
      userId: recipientId,
      type,
      actorId: actorId ?? null,
      dataJson: JSON.stringify(data),
    },
  });
  const notification = await toAppNotification(row);
  const unreadCount = await prisma.notification.count({
    where: { userId: recipientId, readAt: null },
  });
  userHub.pushTo(recipientId, { t: 'notification', notification, unreadCount });
  return notification;
}

/** Сигнал «список друзей/заявок изменился — перезапроси по REST». */
export function pushFriendsChanged(userId: string): void {
  userHub.pushTo(userId, { t: 'friends_changed' });
}
