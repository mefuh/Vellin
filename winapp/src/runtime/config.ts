import { isTauri } from './platform';

/**
 * Адрес бэкенда. Логика двух режимов:
 *  - Нативная сборка (Tauri): абсолютный URL сервера. По умолчанию прод
 *    (https://vellin.ru); переопределяется VITE_SERVER_URL при сборке (напр.
 *    http://localhost:3001 для локального бэкенда).
 *  - Браузерный dev (`npm run dev`): пустая база → относительные пути `/api`,
 *    которые Vite проксирует на локальный сервер (см. vite.config.ts). Так мы
 *    избегаем CORS при разработке UI.
 */
const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string | undefined)?.replace(/\/+$/, '') ?? 'https://vellin.ru';

/** База REST API. Абсолютная в нативной сборке, относительная в браузер-dev. */
export function apiBase(): string {
  return isTauri() ? `${SERVER_URL}/api` : '/api';
}

/** Абсолютный origin сервера (для WS и резолвинга относительных URL, если вернутся). */
export function serverOrigin(): string {
  return isTauri() ? SERVER_URL : window.location.origin;
}

/**
 * Приводит URL медиа (аватар, вложение) к загружаемому виду. Бэкенд с заданным
 * PUBLIC_BASE_URL уже отдаёт абсолютные URL — их не трогаем. Относительный путь
 * (`/api/uploads/...`, когда база не настроена) префиксуем origin сервера в
 * нативной сборке; в браузер-dev оставляем как есть (Vite-прокси отдаёт /api).
 */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/') && isTauri()) return serverOrigin() + url;
  return url;
}
