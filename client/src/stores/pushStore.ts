import { create } from 'zustand';
import type { NotificationPreferenceDTO, PushCategory } from '@vellin/shared';
import { pushApi } from '../api/push';
import {
  disablePush,
  enablePush,
  notificationPermission,
  pushSupported,
  currentSubscription,
  type EnableReason,
  type EnableResult,
} from '../push/register';

const DISMISS_KEY = 'vellin:push-prompt-dismissed';

/** Причина неудачи → понятное пользователю объяснение. */
function enableErrorMessage(reason: EnableReason, detail?: string): string {
  switch (reason) {
    case 'unsupported':
      return 'Браузер не поддерживает push-уведомления.';
    case 'denied':
      return 'Разрешение не выдано. Разрешите уведомления для сайта и повторите.';
    case 'no-key':
      return 'На сервере не настроены ключи VAPID (push выключен).';
    case 'sw-failed':
      return `Не удалось зарегистрировать Service Worker. На localhost по HTTPS это обычно недоверенный сертификат — выполните «mkcert -install» и перезапустите браузер${detail ? ` (${detail})` : ''}.`;
    case 'subscribe-failed':
      return `Браузер не смог оформить подписку${detail ? ` (${detail})` : ''}.`;
    case 'server-failed':
      return `Сервер не принял подписку${detail ? ` (${detail})` : ''}.`;
    default:
      return `Не удалось включить${detail ? ` (${detail})` : ''}.`;
  }
}

interface PushState {
  supported: boolean;
  permission: NotificationPermission;
  /** Подписано ли это устройство (есть активная подписка в браузере). */
  subscribed: boolean;
  preferences: NotificationPreferenceDTO | null;
  busy: boolean;
  loaded: boolean;
  /** Человекочитаемая причина последней неудачи включения (для UI). */
  lastError: string | null;

  /** Подтянуть статус (разрешение, подписка, настройки) с сервера/браузера. */
  refresh: () => Promise<void>;
  /** Включить push на этом устройстве (запросит разрешение). */
  enable: () => Promise<EnableResult>;
  /** Отключить push на этом устройстве. */
  disable: () => Promise<void>;
  /** Поменять главный выключатель push. */
  setPushEnabled: (on: boolean) => Promise<void>;
  /** Переключить категорию. */
  toggleCategory: (cat: PushCategory, on: boolean) => Promise<void>;

  /** Был ли мягкий промпт уже скрыт пользователем (localStorage). */
  promptDismissed: () => boolean;
  dismissPrompt: () => void;
}

export const usePushStore = create<PushState>((set, get) => ({
  supported: pushSupported(),
  permission: notificationPermission(),
  subscribed: false,
  preferences: null,
  busy: false,
  loaded: false,
  lastError: null,

  refresh: async () => {
    const supported = pushSupported();
    set({ supported, permission: notificationPermission() });
    if (!supported) {
      set({ loaded: true });
      return;
    }
    try {
      const [{ preferences }, sub] = await Promise.all([pushApi.preferences(), currentSubscription()]);
      set({ preferences, subscribed: !!sub, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  enable: async () => {
    set({ busy: true, lastError: null });
    const res = await enablePush();
    set({ busy: false, permission: notificationPermission() });
    if (res.ok) {
      set({ subscribed: true, lastError: null });
      await get().setPushEnabled(true);
    } else {
      set({ lastError: enableErrorMessage(res.reason, res.detail) });
    }
    return res;
  },

  disable: async () => {
    set({ busy: true });
    await disablePush();
    set({ busy: false, subscribed: false });
  },

  setPushEnabled: async (on) => {
    try {
      const { preferences } = await pushApi.updatePreferences({ pushEnabled: on });
      set({ preferences });
    } catch {
      /* ignore */
    }
  },

  toggleCategory: async (cat, on) => {
    const cur = get().preferences;
    if (cur) set({ preferences: { ...cur, categories: { ...cur.categories, [cat]: on } } });
    try {
      const { preferences } = await pushApi.updatePreferences({ categories: { [cat]: on } });
      set({ preferences });
    } catch {
      /* следующий refresh восстановит */
    }
  },

  promptDismissed: () => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  },
  dismissPrompt: () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    set({}); // триггер ре-рендера подписчиков
  },
}));
