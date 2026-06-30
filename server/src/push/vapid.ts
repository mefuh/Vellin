import webpush from 'web-push';
import { loadEnv } from '../env.js';
import { logger } from '../utils/logger.js';

/**
 * Конфигурация web-push. VAPID-детали ставятся один раз при первом обращении.
 * Если ключи не заданы — push-слой считается выключенным, а все вызовы отправки
 * становятся no-op (корректная деградация, остальной сервис работает как обычно).
 */
let configured = false;
let enabled = false;

function ensureConfigured(): void {
  if (configured) return;
  configured = true;
  const env = loadEnv();
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    enabled = true;
    logger.info('web-push: VAPID configured, push enabled');
  } else {
    enabled = false;
    logger.warn('web-push: VAPID keys missing — push disabled (graceful degradation)');
  }
}

/** Включён ли push-слой (есть ли VAPID-ключи). */
export function isPushEnabled(): boolean {
  ensureConfigured();
  return enabled;
}

/** Публичный VAPID-ключ для клиента (или null, если push выключен). */
export function getVapidPublicKey(): string | null {
  ensureConfigured();
  return enabled ? loadEnv().VAPID_PUBLIC_KEY ?? null : null;
}

export { webpush };
