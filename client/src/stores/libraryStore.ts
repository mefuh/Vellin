import { create } from 'zustand';
import type { UserC2S } from '@vellin/shared';

/** Live-оверрайд превью/названия комнаты, пришедший по /ws/user. */
export interface RoomVideoOverride {
  videoPoster: string | null;
  videoTitle: string | null;
}

interface LibraryState {
  /** roomId → актуальное играющее видео (живое обновление поверх REST-снимка). */
  overrides: Record<string, RoomVideoOverride>;
  /** Открыта ли сейчас библиотека (для ре-подписки после реконнекта). */
  watching: boolean;
  /** Отправитель в /ws/user (ставит RealtimeProvider). */
  _send: ((msg: UserC2S) => void) | null;

  setSender: (fn: ((msg: UserC2S) => void) | null) => void;
  apply: (roomId: string, videoPoster: string | null, videoTitle: string | null) => void;
  watch: () => void;
  unwatch: () => void;
  /** Повторно подписаться (после реконнекта сокета). */
  rewatch: () => void;
  reset: () => void;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  overrides: {},
  watching: false,
  _send: null,

  setSender: (fn) => set({ _send: fn }),

  apply: (roomId, videoPoster, videoTitle) =>
    set((s) => ({ overrides: { ...s.overrides, [roomId]: { videoPoster, videoTitle } } })),

  watch: () => {
    set({ watching: true });
    get()._send?.({ t: 'watch_library' });
  },

  unwatch: () => {
    set({ watching: false });
    get()._send?.({ t: 'unwatch_library' });
  },

  rewatch: () => {
    const { watching, _send } = get();
    if (watching && _send) _send({ t: 'watch_library' });
  },

  reset: () => set({ overrides: {}, watching: false, _send: null }),
}));
