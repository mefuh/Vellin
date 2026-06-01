import { create } from 'zustand';
import type { AppNotification } from '@vellin/shared';
import { notificationsApi } from '../api/notifications';

interface NotificationsState {
  notifications: AppNotification[];
  unreadCount: number;
  panelOpen: boolean;
  /** Снапшот из hello-сообщения пользовательского WS-канала. */
  setSnapshot: (notifications: AppNotification[], unreadCount: number) => void;
  /** Новое входящее уведомление (realtime). */
  add: (notification: AppNotification, unreadCount: number) => void;
  /** Уведомления удалены сервером (заявка отыграна) — убрать по id (realtime). */
  removeMany: (ids: string[], unreadCount: number) => void;
  /** Удалить одно уведомление (напр. приглашение в комнату после перехода). */
  dismiss: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  reset: () => void;
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  panelOpen: false,

  setSnapshot: (notifications, unreadCount) => set({ notifications, unreadCount }),

  add: (notification, unreadCount) =>
    set((s) => ({
      notifications: [notification, ...s.notifications.filter((n) => n.id !== notification.id)].slice(0, 50),
      unreadCount,
    })),

  removeMany: (ids, unreadCount) =>
    set((s) => ({
      notifications: s.notifications.filter((n) => !ids.includes(n.id)),
      unreadCount,
    })),

  dismiss: async (id) => {
    // Оптимистично убираем из списка, затем синхронизируем счётчик с сервером.
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) }));
    try {
      const { unreadCount } = await notificationsApi.dismiss(id);
      set({ unreadCount });
    } catch {
      /* следующий снапшот восстановит состояние */
    }
  },

  markAllRead: async () => {
    if (get().unreadCount === 0) return;
    // Оптимистично гасим бейдж, затем синхронизируемся с сервером.
    set((s) => ({
      unreadCount: 0,
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
    }));
    try {
      const { unreadCount } = await notificationsApi.markRead();
      set({ unreadCount });
    } catch {
      /* следующий снапшот восстановит счётчик */
    }
  },

  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),

  reset: () => set({ notifications: [], unreadCount: 0, panelOpen: false }),
}));
