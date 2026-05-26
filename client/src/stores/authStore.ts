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
  restoreSession: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  loginAsGuest: (username: string) => Promise<void>;
  logout: () => void;
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

  restoreSession: () => {
    const { token, user } = readStorage();
    set({ token, user });
    setTokenGetter(() => get().token);
    if (token && user?.kind === 'user') {
      authApi
        .me()
        .then(({ user: fresh }) => {
          set({ user: fresh });
          persist(get().token, fresh);
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

  logout: () => {
    set({ token: null, user: null });
    persist(null, null);
  },
}));
