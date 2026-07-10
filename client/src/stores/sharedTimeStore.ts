import { create } from 'zustand';
import type { SharedWatchDTO, UserS2CSharedTime } from '@vellin/shared';

/**
 * «Совместное время» по peerId. Гидратируется из DTO профиля при открытии
 * `/u/:username` и обновляется живьём из WS `shared_time` (переходы co-presence).
 * Карточка профиля читает по peerId и, если `together`, тикает число локально
 * из `togetherSince` — серверу не нужен per-second трафик.
 */
interface SharedTimeState {
  byPeer: Record<string, SharedWatchDTO>;
  hydrate: (peerId: string, dto: SharedWatchDTO | undefined) => void;
  apply: (msg: UserS2CSharedTime) => void;
  reset: () => void;
}

export const useSharedTimeStore = create<SharedTimeState>((set) => ({
  byPeer: {},

  hydrate: (peerId, dto) =>
    set((s) => (dto ? { byPeer: { ...s.byPeer, [peerId]: dto } } : s)),

  apply: (msg) =>
    set((s) => ({
      byPeer: {
        ...s.byPeer,
        [msg.peerId]: {
          totalSeconds: msg.totalSeconds,
          sessionsCount: msg.sessionsCount,
          longestSessionSeconds: msg.longestSessionSeconds,
          firstWatchedAt: msg.firstWatchedAt,
          lastWatchedAt: msg.lastWatchedAt,
          together: msg.together,
          togetherSince: msg.togetherSince,
        },
      },
    })),

  reset: () => set({ byPeer: {} }),
}));
