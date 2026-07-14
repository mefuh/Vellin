import { create } from 'zustand';
import type { FriendPresence, FriendRequest, FriendUser } from '@vellin/shared';
import { friendsApi } from '../api/friends';

interface FriendsState {
  friends: FriendUser[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  loading: boolean;
  loaded: boolean;
  /** Перезапросить друзей + заявки (по сигналу friends_changed или вручную). */
  refresh: () => Promise<void>;
  /** Применить live-присутствие друга. */
  applyPresence: (p: FriendPresence) => void;
  reset: () => void;
}

let inflight: Promise<void> | null = null;

export const useFriendsStore = create<FriendsState>((set) => ({
  friends: [],
  incoming: [],
  outgoing: [],
  loading: false,
  loaded: false,

  refresh: () => {
    // Сворачиваем параллельные вызовы в один запрос.
    if (inflight) return inflight;
    set({ loading: true });
    inflight = (async () => {
      try {
        const [{ friends }, { requests }] = await Promise.all([
          friendsApi.list(),
          friendsApi.requests(),
        ]);
        set({
          friends,
          incoming: requests.filter((r) => r.direction === 'incoming'),
          outgoing: requests.filter((r) => r.direction === 'outgoing'),
          loading: false,
          loaded: true,
        });
      } catch {
        set({ loading: false });
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  },

  applyPresence: (p) =>
    set((s) => ({
      friends: s.friends.map((f) =>
        f.id === p.userId
          ? {
              ...f,
              online: p.online,
              currentRoom: p.currentRoom,
              // Без этого у друга, ушедшего в офлайн при открытой странице,
              // оставался lastSeenAt: null (каким он был, пока тот был онлайн),
              // и статус показывался как «не в сети» вместо времени захода.
              lastSeenAt: p.lastSeenAt ?? f.lastSeenAt,
            }
          : f,
      ),
    })),

  reset: () => set({ friends: [], incoming: [], outgoing: [], loading: false, loaded: false }),
}));
