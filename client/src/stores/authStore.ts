import { create } from 'zustand';
import type { AuthUser } from '@vellin/shared';
import { authApi } from '../api/auth';
import { setTokenGetter } from '../api/client';

const STORAGE_KEY = 'vellin.auth';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  /** Активны ли технические работы (из /api/runtime + live-пуш по WS). */
  maintenanceActive: boolean;
  /** Сообщение экрана обслуживания. */
  maintenanceMessage: string;
  setMaintenance: (enabled: boolean, message: string) => void;
  /**
   * Ключи включённых feature-флагов (из /api/runtime). `null` — ещё не
   * загружено: до ответа считаем функции включёнными, чтобы не мигать скрытием.
   */
  featureFlags: string[] | null;
  setFeatureFlags: (flags: string[]) => void;
  restoreSession: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  loginAsGuest: (username: string) => Promise<void>;
  /** Применить свежие token+user после мутаций профиля (тот же sid). */
  applyAuthUpdate: (update: { token: string; user: AuthUser }) => void;
  /**
   * Выход из аккаунта. Во время технических работ добровольный выход
   * администратора запрещён — иначе он не сможет вернуться (страница входа под
   * maintenance-экраном) и не выключит тех.работы. Принудительные выходы
   * (блокировка аккаунта и т.п.) проходят с `force: true`. Возвращает true,
   * если выход состоялся.
   */
  logout: (opts?: { force?: boolean }) => boolean;
}

function persist(token: string | null, user: AuthUser | null): void {
  if (!token || !user) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
}

function readStorage(): { token: string | null; user: AuthUser | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { token: null, user: null };
    const parsed = JSON.parse(raw) as { token?: string; user?: AuthUser };
    // legacy storage may lack isAdmin — backfill with false. /auth/me на
    // mount всё равно перезапишет user из сервера.
    const rawUser = parsed.user as (AuthUser & { isAdmin?: boolean }) | undefined;
    const user = rawUser
      ? { ...rawUser, isAdmin: rawUser.isAdmin ?? false }
      : null;
    return { token: parsed.token ?? null, user };
  } catch {
    return { token: null, user: null };
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  loading: false,
  error: null,
  maintenanceActive: false,
  maintenanceMessage: '',
  featureFlags: null,

  setMaintenance: (enabled, message) => {
    const s = get();
    if (s.maintenanceActive !== enabled || s.maintenanceMessage !== message) {
      set({ maintenanceActive: enabled, maintenanceMessage: message });
    }
  },

  setFeatureFlags: (flags) => set({ featureFlags: flags }),

  restoreSession: () => {
    const { token, user } = readStorage();
    set({ token, user });
    setTokenGetter(() => get().token);
    if (token && user?.kind === 'user') {
      authApi
        .me()
        .then(({ user: fresh, token: upgraded }) => {
          // Сервер мог перевыпустить токен (апгрейд легаси-токена до сессии).
          const nextToken = upgraded ?? get().token;
          set({ user: fresh, token: nextToken });
          persist(nextToken, fresh);
        })
        .catch(() => {
          set({ token: null, user: null });
          persist(null, null);
        });
    }
  },

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const { token, user } = await authApi.login({ email, password });
      set({ token, user, loading: false });
      persist(token, user);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      set({ loading: false, error: message });
      throw err;
    }
  },

  register: async (email, username, password) => {
    set({ loading: true, error: null });
    try {
      const { token, user } = await authApi.register({ email, username, password });
      set({ token, user, loading: false });
      persist(token, user);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Register failed';
      set({ loading: false, error: message });
      throw err;
    }
  },

  loginAsGuest: async (username) => {
    set({ loading: true, error: null });
    try {
      const { token, user } = await authApi.guest({ username });
      set({ token, user, loading: false });
      persist(token, user);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Guest login failed';
      set({ loading: false, error: message });
      throw err;
    }
  },

  applyAuthUpdate: ({ token, user }) => {
    set({ token, user });
    persist(token, user);
  },

  logout: (opts) => {
    const { user, maintenanceActive } = get();
    if (!opts?.force && maintenanceActive && user?.isAdmin) {
      set({ error: 'Во время технических работ выход из аккаунта администратора отключён — иначе вы не сможете вернуться и выключить режим обслуживания.' });
      return false;
    }
    set({ token: null, user: null });
    persist(null, null);
    return true;
  },
}));

/**
 * Включён ли feature-флаг. `null` (рантайм ещё не загружен) трактуем как
 * «включено», чтобы не мигать скрытием функции до ответа /runtime.
 */
export function featureEnabled(flags: string[] | null, key: string): boolean {
  return flags === null || flags.includes(key);
}

/** Реактивный хук: включён ли feature-флаг (см. {@link featureEnabled}). */
export function useFeatureEnabled(key: string): boolean {
  return useAuthStore((s) => featureEnabled(s.featureFlags, key));
}
