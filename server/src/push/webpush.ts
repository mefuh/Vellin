import type { PushSubscription as PrismaPushSubscription } from '@prisma/client';
import type { PushPayload, NotificationTemplateDTO } from '@vellin/shared';
import { logger } from '../utils/logger.js';
import { isPushEnabled, webpush } from './vapid.js';

export interface SendResult {
  ok: boolean;
  statusCode?: number;
  /** Подписка мертва (404/410) — её нужно деактивировать. */
  gone: boolean;
}

interface SendOptions {
  ttl: number;
  urgency: 'very-low' | 'low' | 'normal' | 'high';
}

/**
 * Отправить одну нотификацию на одну подписку. Никогда не бросает — возвращает
 * результат, чтобы вызывающий мог обновить статистику и удалить мёртвые подписки.
 * 404/410 от push-сервиса = подписка отозвана/устарела → gone:true.
 */
export async function sendToSubscription(
  sub: Pick<PrismaPushSubscription, 'endpoint' | 'p256dh' | 'auth'>,
  payload: PushPayload,
  opts: SendOptions,
): Promise<SendResult> {
  if (!isPushEnabled()) return { ok: false, gone: false };
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: opts.ttl, urgency: opts.urgency },
    );
    return { ok: true, statusCode: 201, gone: false };
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    const gone = statusCode === 404 || statusCode === 410;
    if (!gone) {
      logger.warn({ statusCode, endpoint: sub.endpoint.slice(0, 48) }, 'web-push send failed');
    }
    return { ok: false, statusCode, gone };
  }
}

/** Параметры доставки из шаблона (TTL/urgency) с безопасными дефолтами. */
export function deliveryOptionsFromTemplate(tpl: NotificationTemplateDTO): SendOptions {
  return { ttl: tpl.ttl, urgency: tpl.urgency };
}
