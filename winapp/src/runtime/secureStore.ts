import type { AuthUser } from '@vellin/shared';
import { isTauri } from './platform';

/**
 * Хранилище сессии (token + user). Под Tauri — плагин store (файл в приватном
 * каталоге приложения ОС), под браузером — localStorage (только dev).
 *
 * ВАЖНО (hardening): плагин store хранит данные в JSON без шифрования. Для
 * продакшн-хранения долгоживущего JWT это приемлемый MVP, но на следующем шаге
 * стоит переехать на ОС-хранилище секретов (Windows Credential Manager через
 * stronghold/keyring). Точка изоляции — этот модуль, менять только его.
 */

const STORAGE_KEY = 'session';
const STORE_FILE = 'auth.json';
const LS_KEY = 'vellin.winapp.auth';

export interface Session {
  token: string;
  user: AuthUser;
}

// Ленивая инициализация Tauri-store (динамический импорт — чтобы браузерная
// сборка не тянула нативный плагин в рантайме).
let storePromise: Promise<import('@tauri-apps/plugin-store').Store> | null = null;
async function tauriStore(): Promise<import('@tauri-apps/plugin-store').Store> {
  if (!storePromise) {
    storePromise = import('@tauri-apps/plugin-store').then((m) => m.load(STORE_FILE, { autoSave: false }));
  }
  return storePromise;
}

export async function loadSession(): Promise<Session | null> {
  try {
    if (isTauri()) {
      const store = await tauriStore();
      const raw = await store.get<Session>(STORAGE_KEY);
      return raw ?? null;
    }
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export async function saveSession(session: Session): Promise<void> {
  if (isTauri()) {
    const store = await tauriStore();
    await store.set(STORAGE_KEY, session);
    await store.save();
    return;
  }
  localStorage.setItem(LS_KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  if (isTauri()) {
    const store = await tauriStore();
    await store.delete(STORAGE_KEY);
    await store.save();
    return;
  }
  localStorage.removeItem(LS_KEY);
}
