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

/**
 * Удалить уведомления получателя по фильтру (тип/актор) и сообщить клиенту,
 * чтобы они мгновенно пропали из белла. Вызывается, когда действие отыграно:
 * заявку в друзья приняли/отклонили/отменили и т.п. — иначе уведомления
 * копятся (особенно при повторных заявках после отклонения).
 */
export async function removeNotifications(
  recipientId: string,
  filter: { type?: NotificationType; actorId?: string },
): Promise<void> {
  const rows = await prisma.notification.findMany({
    where: { userId: recipientId, ...filter },
    select: { id: true },
  });
  if (rows.length === 0) return;
  const ids = rows.map((r) => r.id);
  await prisma.notification.deleteMany({ where: { id: { in: ids } } });
  const unreadCount = await prisma.notification.count({
    where: { userId: recipientId, readAt: null },
  });
  userHub.pushTo(recipientId, { t: 'notifications_removed', ids, unreadCount });
}

/**
 * Удалить одно уведомление получателя по id (только своё). Возвращает свежий
 * unreadCount. Live-сигнал клиенту не шлём: вызывающий (тот же пользователь)
 * убирает его локально, а на других сессиях подхватится при следующем снапшоте.
 */
export async function removeNotificationById(recipientId: string, id: string): Promise<number> {
  await prisma.notification.deleteMany({ where: { id, userId: recipientId } });
  return prisma.notification.count({ where: { userId: recipientId, readAt: null } });
}
