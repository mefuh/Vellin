import type { DeviceInfo } from '@vellin/shared';
import { pushApi } from '../api/push';

/** Поддерживает ли браузер Web-Push (SW + PushManager + Notification). */
export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Текущее разрешение браузера на уведомления. */
export function notificationPermission(): NotificationPermission {
  return pushSupported() ? Notification.permission : 'denied';
}

/** Параметры устройства из User-Agent (для реестра подписок). */
export function detectDevice(): DeviceInfo {
  const ua = navigator.userAgent;
  let browser = 'Браузер';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/SamsungBrowser/.test(ua)) browser = 'Samsung Internet';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';

  let os = 'Устройство';
  if (/Windows/.test(ua)) os = 'Windows';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  const standalone = window.matchMedia('(display-mode: standalone)').matches;
  return { browser, os, deviceLabel: `${browser} · ${os}${standalone ? ' · PWA' : ''}` };
}

function urlBase64ToBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buffer;
}

let regPromise: Promise<ServiceWorkerRegistration> | null = null;

/** Зарегистрировать (один раз) Service Worker со scope '/'. */
export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!regPromise) {
    regPromise = navigator.serviceWorker.register('/sw.js', { scope: '/' });
  }
  return regPromise;
}

/** Текущая подписка устройства (или null). */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await ensureServiceWorker();
  return reg.pushManager.getSubscription();
}

function toInput(sub: PushSubscription): { endpoint: string; keys: { p256dh: string; auth: string } } {
  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
  };
}

export type EnableReason =
  | 'unsupported'
  | 'denied'
  | 'no-key'
  | 'sw-failed'
  | 'subscribe-failed'
  | 'server-failed'
  | 'error';

export type EnableResult = { ok: true } | { ok: false; reason: EnableReason; detail?: string };

/**
 * Включить push: запросить разрешение (если ещё не дано), подписаться и
 * зарегистрировать подписку на сервере. Идемпотентно: повторный вызов
 * переиспользует существующую подписку. Ошибки детализированы по шагу — чтобы
 * в UI было видно, что именно не получилось (частый кейс на ПК — самоподписанный
 * сертификат: браузер не регистрирует Service Worker → reason 'sw-failed').
 */
export async function enablePush(): Promise<EnableResult> {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };

  let permission: NotificationPermission;
  try {
    permission =
      Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  } catch (e) {
    return { ok: false, reason: 'error', detail: String(e) };
  }
  if (permission !== 'granted') return { ok: false, reason: 'denied' };

  let publicKey: string | null;
  try {
    publicKey = (await pushApi.vapidKey()).publicKey;
  } catch (e) {
    return { ok: false, reason: 'server-failed', detail: String(e) };
  }
  if (!publicKey) return { ok: false, reason: 'no-key' };

  // Регистрация Service Worker — чаще всего падает тут (недоверенный сертификат).
  let reg: ServiceWorkerRegistration;
  try {
    reg = await ensureServiceWorker();
    await navigator.serviceWorker.ready;
  } catch (e) {
    console.error('[push] service worker registration failed', e);
    return { ok: false, reason: 'sw-failed', detail: String(e) };
  }

  // Подписка в push-сервисе.
  let sub: PushSubscription | null;
  try {
    sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBuffer(publicKey),
      });
    }
  } catch (e) {
    console.error('[push] pushManager.subscribe failed', e);
    return { ok: false, reason: 'subscribe-failed', detail: String(e) };
  }

  // Регистрация на сервере.
  try {
    await pushApi.subscribe(toInput(sub), detectDevice());
  } catch (e) {
    return { ok: false, reason: 'server-failed', detail: String(e) };
  }
  return { ok: true };
}

/** Выключить push: отписаться у браузера и удалить подписку на сервере. */
export async function disablePush(): Promise<void> {
  try {
    const sub = await currentSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe().catch(() => {});
      await pushApi.unsubscribe(endpoint).catch(() => {});
    }
  } catch {
    /* ignore */
  }
}

/**
 * Тихая ре-синхронизация при старте приложения для уже разрешивших push: если
 * разрешение granted и подписка есть — переотправляем её на сервер (idempotent
 * upsert обновит lastUsed/устройство и реактивирует, если была деактивирована).
 * Ничего не запрашивает у пользователя.
 */
export async function syncSubscription(): Promise<void> {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  try {
    const { publicKey } = await pushApi.vapidKey();
    if (!publicKey) return;
    const reg = await ensureServiceWorker();
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBuffer(publicKey),
      });
    }
    await pushApi.subscribe(toInput(sub), detectDevice());
  } catch {
    /* ignore — push не критичен для работы приложения */
  }
}
