// ── Web-Push: общие типы протокола (source of truth для сервера и клиента) ──
//
// Push-слой намеренно отделён от внутреннего «колокольчика» (domain.ts
// NotificationType / AppNotification): он покрывает более широкий набор типов и
// категорий и не трогает существующую логику белла. Доменное событие → push-тип
// → категория (для гейтинга настройками) → шаблон → PushPayload.

/** Ключ шаблона/типа push-уведомления. Расширяется без правки существующего кода. */
export type PushNotificationType =
  | 'direct_message'
  | 'friend_request'
  | 'friend_accepted'
  | 'room_invite'
  | 'room_started'
  | 'system'
  | 'news'
  | 'marketing';

/** Категория для пользовательских настроек (один тумблер может покрывать тип). */
export type PushCategory =
  | 'direct_messages'
  | 'friend_requests'
  | 'friend_accepted'
  | 'room_invites'
  | 'room_started'
  | 'system'
  | 'news'
  | 'marketing';

/** Тип → категория настроек. Новый тип добавляется одной строкой. */
export const PUSH_TYPE_CATEGORY: Record<PushNotificationType, PushCategory> = {
  direct_message: 'direct_messages',
  friend_request: 'friend_requests',
  friend_accepted: 'friend_accepted',
  room_invite: 'room_invites',
  room_started: 'room_started',
  system: 'system',
  news: 'news',
  marketing: 'marketing',
};

/** Полный список категорий с человекочитаемыми подписями (для страницы настроек). */
export const PUSH_CATEGORIES: { id: PushCategory; label: string; hint: string }[] = [
  { id: 'direct_messages', label: 'Личные сообщения', hint: 'Новые сообщения в диалогах' },
  { id: 'friend_requests', label: 'Заявки в друзья', hint: 'Когда вам отправили заявку' },
  { id: 'friend_accepted', label: 'Принятие заявки', hint: 'Когда вашу заявку приняли' },
  { id: 'room_invites', label: 'Приглашения в комнаты', hint: 'Когда вас зовут смотреть' },
  { id: 'room_started', label: 'Начало просмотра', hint: 'Когда в комнате запустили фильм' },
  { id: 'system', label: 'Системные', hint: 'Обновления и важные объявления' },
  { id: 'news', label: 'Новости', hint: 'Новые функции и события' },
  { id: 'marketing', label: 'Маркетинговые', hint: 'Акции и предложения' },
];

/**
 * Полезная нагрузка, которую Service Worker получает в `push` событии и
 * показывает как нотификацию. `data.url` — deep-link для перехода по клику.
 */
export interface PushPayload {
  type: PushNotificationType;
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  /** Группировка нотификаций ОС: одинаковый tag заменяет предыдущую. */
  tag?: string;
  requireInteraction?: boolean;
  silent?: boolean;
  /** Перевыпустить (звук/вибро) при замене по tag. */
  renotify?: boolean;
  data: {
    type: PushNotificationType;
    /** Куда вести по клику (относительный путь приложения). */
    url: string;
    /** Для аналитики кликов (Фаза 2/3). */
    jobId?: string;
  };
}

/** Параметры устройства, сохраняемые в реестре подписок. */
export interface DeviceInfo {
  browser: string;
  os: string;
  deviceLabel: string;
}

/** Сырая подписка из `PushManager.subscribe()` (для отправки на сервер). */
export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Одно зарегистрированное устройство (для настроек/админки). */
export interface DeviceDTO {
  id: string;
  browser: string;
  os: string;
  deviceLabel: string;
  createdAt: string;
  lastUsedAt: string;
  active: boolean;
  /** Это устройство = текущая подписка этого браузера. */
  current?: boolean;
}

/** Настройки уведомлений пользователя. */
export interface NotificationPreferenceDTO {
  /** Главный выключатель — false глушит все push. */
  pushEnabled: boolean;
  /** Категория → включена ли. Отсутствие ключа трактуется как «включена». */
  categories: Record<PushCategory, boolean>;
}

/** Шаблон уведомления (редактируемый из админки). */
export interface NotificationTemplateDTO {
  type: PushNotificationType;
  title: string;
  body: string;
  icon: string;
  badge: string;
  image: string | null;
  url: string;
  sound: string | null;
  ttl: number;
  urgency: 'very-low' | 'low' | 'normal' | 'high';
  requireInteraction: boolean;
  tag: string | null;
  silent: boolean;
  enabled: boolean;
  updatedAt: string;
}

// ── REST-контракты push ──────────────────────────────────────────────────

export interface VapidKeyResponse {
  /** Публичный VAPID-ключ (base64url) для PushManager.subscribe. Пусто = push выключен на сервере. */
  publicKey: string | null;
}

export interface SubscribeRequest {
  subscription: PushSubscriptionInput;
  device: DeviceInfo;
}

export interface SubscribeResponse {
  ok: true;
  deviceId: string;
}

export interface UnsubscribeRequest {
  endpoint: string;
}

export interface PreferencesResponse {
  preferences: NotificationPreferenceDTO;
}

export interface UpdatePreferencesRequest {
  pushEnabled?: boolean;
  categories?: Partial<Record<PushCategory, boolean>>;
}

// ── Админ-контракты push (Фаза 3) ──────────────────────────────────────────

/** Сводка дашборда push-уведомлений. */
export interface PushDashboardDTO {
  totalDevices: number;
  activeDevices: number;
  usersWithPush: number;
  usersPushDisabled: number;
  optInPercent: number;
  sentDay: number;
  sentWeek: number;
  sentMonth: number;
  queuePending: number;
}

/** Статистика доставок за окно (по умолчанию 30 дней). */
export interface PushStatsDTO {
  sent: number;
  failed: number;
  expired: number;
  rejected: number;
  clicked: number;
  /** Click-through rate, % (clicked / sent). */
  ctr: number;
  byBrowser: { browser: string; sent: number }[];
}

/** Описание аудитории массовой рассылки. */
export type BroadcastAudience =
  | { kind: 'all' }
  | { kind: 'role'; role: 'admin' | 'user' }
  | { kind: 'users'; userIds: string[] };

export interface SendBroadcastRequest {
  type: PushNotificationType;
  title: string;
  body: string;
  url: string;
  audience: BroadcastAudience;
}

export interface SendBroadcastResponse {
  ok: true;
  totalTargets: number;
  queued: number;
}

export interface PushBroadcastDTO {
  id: string;
  type: PushNotificationType;
  title: string;
  body: string;
  url: string;
  audience: BroadcastAudience;
  totalTargets: number;
  sent: number;
  failed: number;
  createdAt: string;
}

export interface PushDashboardResponse {
  dashboard: PushDashboardDTO;
  stats: PushStatsDTO;
}

export interface PushTemplatesResponse {
  templates: NotificationTemplateDTO[];
}

export type UpdateTemplateRequest = Partial<Omit<NotificationTemplateDTO, 'type' | 'updatedAt'>>;

export interface PushBroadcastsResponse {
  broadcasts: PushBroadcastDTO[];
}
