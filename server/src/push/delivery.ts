import type { PushNotificationType } from '@vellin/shared';
import { prisma } from '../db/prisma.js';

export type DeliveryStatus = 'sent' | 'failed' | 'expired' | 'rejected' | 'clicked';

/** Записать факт доставки/ошибки в журнал (для статистики и аналитики). */
export async function recordDelivery(entry: {
  jobId?: string;
  userId: string;
  subscriptionId?: string;
  type: PushNotificationType;
  status: DeliveryStatus;
  error?: string;
  browser?: string;
  os?: string;
}): Promise<void> {
  await prisma.pushDelivery
    .create({
      data: {
        jobId: entry.jobId ?? null,
        userId: entry.userId,
        subscriptionId: entry.subscriptionId ?? null,
        type: entry.type,
        status: entry.status,
        error: entry.error?.slice(0, 300) ?? null,
        browser: entry.browser ?? null,
        os: entry.os ?? null,
      },
    })
    .catch(() => {});
}
