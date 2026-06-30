/* Vellin Service Worker — Web-Push.
 * Принимает push, показывает нотификацию, обрабатывает клик (фокус открытого
 * приложения + deep-link через postMessage, либо открытие нового окна), и
 * переподписывается при ротации подписки push-сервисом.
 *
 * Это НЕ offline-кэш SW: кэширование статики делает Caddy. Файл намеренно
 * минимальный и без сборки (обычный JS), отдаётся с no-cache.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = payload.title || 'Vellin';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/icon-192.png',
    image: payload.image || undefined,
    tag: payload.tag || undefined,
    renotify: payload.renotify || false,
    requireInteraction: payload.requireInteraction || false,
    silent: payload.silent || false,
    timestamp: Date.now(),
    data: payload.data || { url: '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = data.url || '/';
  const target = new URL(url, self.location.origin).href;

  // Клик-бикон для CTR (jobId неугадываемый; маршрут публичный, ничего не раскрывает).
  if (data.jobId) {
    try {
      fetch('/api/push/clicked', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jobId: data.jobId }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* ignore */
    }
  }

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Если приложение уже открыто — фокусируем его и просим перейти на нужный
      // экран через postMessage (SPA-навигация без перезагрузки).
      for (const client of all) {
        if ('focus' in client) {
          await client.focus();
          client.postMessage({ type: 'vellin:navigate', url });
          return;
        }
      }
      // Иначе — открываем новое окно сразу на нужном маршруте.
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })(),
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  // Push-сервис отозвал/сменил подписку — пытаемся переподписаться тем же
  // ключом и просим открытые вкладки пере-синхронизировать её на сервере.
  event.waitUntil(
    (async () => {
      try {
        const appServerKey =
          (event.oldSubscription &&
            event.oldSubscription.options &&
            event.oldSubscription.options.applicationServerKey) ||
          undefined;
        if (!appServerKey) return;
        await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey,
        });
      } catch {
        /* при следующем открытии приложения register.ts пере-подпишет с авторизацией */
      }
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) client.postMessage({ type: 'vellin:resubscribe' });
    })(),
  );
});
