import type { DeviceInfo, PushSubscriptionInput, DeviceDTO } from '@vellin/shared';
import { prisma } from '../db/prisma.js';

/**
 * Зарегистрировать (или обновить) подписку устройства. Идемпотентно по endpoint:
 * один и тот же браузер при повторной подписке обновляет ключи/метаданные, а не
 * плодит дубли. Возвращает id записи устройства.
 */
export async function registerDevice(
  userId: string,
  sub: PushSubscriptionInput,
  device: DeviceInfo,
  userAgent: string | null,
): Promise<string> {
  const row = await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: {
      userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      browser: device.browser,
      os: device.os,
      deviceLabel: device.deviceLabel,
      userAgent,
      active: true,
    },
    update: {
      // endpoint мог «переехать» к другому аккаунту на том же устройстве — берём
      // актуального владельца и реактивируем подписку с новыми ключами.
      userId,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      browser: device.browser,
      os: device.os,
      deviceLabel: device.deviceLabel,
      userAgent,
      active: true,
      failureCount: 0,
      lastUsedAt: new Date(),
    },
  });
  return row.id;
}

/** Активные подписки пользователя (для рассылки push). */
export function activeSubscriptions(userId: string) {
  return prisma.pushSubscription.findMany({ where: { userId, active: true } });
}

/** Деактивировать подписку по endpoint (мёртвая/отозванная). */
export async function deactivateByEndpoint(endpoint: string): Promise<void> {
  await prisma.pushSubscription.updateMany({
    where: { endpoint },
    data: { active: false },
  });
}

/** Полностью удалить подписку (явная отписка пользователя). */
export async function removeByEndpoint(userId: string, endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

/** Отметить успешную доставку: lastUsed + сброс счётчика ошибок. */
export async function markUsed(id: string): Promise<void> {
  await prisma.pushSubscription.update({
    where: { id },
    data: { lastUsedAt: new Date(), failureCount: 0 },
  });
}

/**
 * Зафиксировать ошибку доставки. gone (404/410) → деактивировать сразу; иначе
 * нарастить счётчик и деактивировать после порога (защита от вечных ретраев).
 */
export async function markFailure(id: string, gone: boolean): Promise<void> {
  if (gone) {
    await prisma.pushSubscription.update({ where: { id }, data: { active: false } }).catch(() => {});
    return;
  }
  const row = await prisma.pushSubscription
    .update({ where: { id }, data: { failureCount: { increment: 1 } } })
    .catch(() => null);
  if (row && row.failureCount >= 8) {
    await prisma.pushSubscription.update({ where: { id }, data: { active: false } }).catch(() => {});
  }
}

/** Список устройств пользователя (для страницы настроек/админки). */
export async function listDevices(userId: string, currentEndpoint?: string): Promise<DeviceDTO[]> {
  const rows = await prisma.pushSubscription.findMany({
    where: { userId },
    orderBy: { lastUsedAt: 'desc' },
  });
  return rows.map((r) => ({
    id: r.id,
    browser: r.browser,
    os: r.os,
    deviceLabel: r.deviceLabel,
    createdAt: r.createdAt.toISOString(),
    lastUsedAt: r.lastUsedAt.toISOString(),
    active: r.active,
    current: currentEndpoint ? r.endpoint === currentEndpoint : undefined,
  }));
}
