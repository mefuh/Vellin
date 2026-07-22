import { create } from 'zustand';
import type { AuthUser } from '@vellin/shared';
import { authApi } from '../api/auth';
import { ApiHttpError, setTokenGetter } from '../api/client';
import { clearSession, loadSession, saveSession } from '../runtime/secureStore';

/**
 * Сессия WinApp. Только зарегистрированные пользователи — гостевого входа в
 * клиентах нет. Хранилище токена асинхронное (ОС-хранилище через Tauri), поэтому
 * восстановление сессии — тоже async; до его завершения `ready=false` и роутер
 * показывает сплэш вместо мигания экраном входа.
 */
interface AuthState {
  token: string | null;
  user: AuthUser | null;
  /** Восстановление сессии из хранилища завершено. */
  ready: boolean;
  loading: boolean;
  error: string | null;
  restoreSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  applyAuthUpdate: (update: { token: string; user: AuthUser }) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  ready: false,
  loading: false,
  error: null,

  restoreSession: async () => {
    setTokenGetter(() => get().token);
    const stored = await loadSession();
    if (!stored) {
      set({ ready: true });
      return;
    }
    set({ token: stored.token, user: stored.user });
    // Освежаем пользователя с сервера; сервер мог перевыпустить токен.
    try {
      const { user, token } = await authApi.me();
      const nextToken = token ?? get().token!;
      set({ user, token: nextToken, ready: true });
      await saveSession({ token: nextToken, user });
    } catch (err) {
      // 401/403 → сессия недействительна: разлогиниваем. Сетевую ошибку не
      // считаем разлогином — работаем на кэшированной сессии.
      if (err instanceof ApiHttpError && (err.status === 401 || err.status === 403)) {
        await clearSession();
        set({ token: null, user: null, ready: true });
      } else {
        set({ ready: true });
      }
    }
  },

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const { token, user } = await authApi.login({ email, password });
      set({ token, user, loading: false });
      await saveSession({ token, user });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Не удалось войти' });
      throw err;
    }
  },

  register: async (email, username, password) => {
    set({ loading: true, error: null });
    try {
      const { token, user } = await authApi.register({ email, username, password });
      set({ token, user, loading: false });
      await saveSession({ token, user });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Не удалось зарегистрироваться' });
      throw err;
    }
  },

  applyAuthUpdate: ({ token, user }) => {
    set({ token, user });
    void saveSession({ token, user });
  },

  logout: async () => {
    set({ token: null, user: null });
    await clearSession();
  },
}));
