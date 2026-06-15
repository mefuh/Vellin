import { create } from 'zustand';
import type { FriendPresence, RoomRef, UserC2S } from '@vellin/shared';

export interface LivePresence {
  online: boolean;
  currentRoom: RoomRef | null;
  lastSeenAt: string | null;
}

interface PresenceState {
  /** userId → актуальное присутствие (из presence/hello или REST-сидов). */
  byId: Record<string, LivePresence>;
  /** Кого сейчас «смотрим» (открыта страница профиля) — для ре-подписки. */
  watching: string | null;
  /** Отправитель в /ws/user (ставит RealtimeProvider). */
  _send: ((msg: UserC2S) => void) | null;

  setSender: (fn: ((msg: UserC2S) => void) | null) => void;
  apply: (p: FriendPresence) => void;
  /** Засеять начальным состоянием из REST-ответа профиля. */
  seed: (userId: string, p: LivePresence) => void;
  watch: (userId: string) => void;
  unwatch: (userId: string) => void;
  /** Повторно подписаться на текущего (после реконнекта сокета). */
  rewatch: () => void;
  reset: () => void;
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  byId: {},
  watching: null,
  _send: null,

  setSender: (fn) => set({ _send: fn }),

  apply: (p) =>
    set((s) => ({
      byId: {
        ...s.byId,
        [p.userId]: { online: p.online, currentRoom: p.currentRoom, lastSeenAt: p.lastSeenAt },
      },
    })),

  seed: (userId, p) => set((s) => ({ byId: { ...s.byId, [userId]: p } })),

  watch: (userId) => {
    set({ watching: userId });
    get()._send?.({ t: 'watch_presence', userId });
  },

  unwatch: (userId) => {
    if (get().watching === userId) set({ watching: null });
    get()._send?.({ t: 'unwatch_presence', userId });
  },

  rewatch: () => {
    const { watching, _send } = get();
    if (watching && _send) _send({ t: 'watch_presence', userId: watching });
  },

  reset: () => set({ byId: {}, watching: null, _send: null }),
}));
