/**
 * Определение среды выполнения и метаданные клиента. WinApp живёт в двух
 * режимах: нативная оболочка Tauri (продакшн) и обычный браузер (`npm run dev`
 * для быстрой разработки UI). Часть API (безопасное хранилище, HTTP без CORS)
 * доступна только под Tauri — здесь единая точка, где это различается.
 */

/** Запущены ли мы внутри нативной оболочки Tauri (а не в браузере). */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Версия приложения (из package.json через Vite define). */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

/** Платформа клиента — уходит в заголовок X-App-Platform (версионный гейтинг). */
export const APP_PLATFORM = 'windows' as const;
