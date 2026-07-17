import type { NotificationTemplateDTO, PushNotificationType } from '@vellin/shared';

/**
 * Человеческий слой над техническими сущностями push-раздела: понятные названия
 * типов уведомлений, переменных шаблона, приоритетов, срока жизни и расшифровки
 * метрик. Одно место правды — и список, и редактор, и аналитика берут отсюда.
 */

// ── Типы уведомлений ─────────────────────────────────────────────────────────
export interface TypeMeta { label: string; description: string; icon: string; }

export const PUSH_TYPE_META: Record<PushNotificationType, TypeMeta> = {
  direct_message: { label: 'Личное сообщение', description: 'Когда пользователю пишут в личку', icon: 'chat' },
  friend_request: { label: 'Заявка в друзья', description: 'Когда пользователю отправили заявку', icon: 'userPlus' },
  friend_accepted: { label: 'Заявку приняли', description: 'Когда заявку пользователя приняли', icon: 'check' },
  room_invite: { label: 'Приглашение в комнату', description: 'Когда пользователя зовут смотреть вместе', icon: 'link' },
  room_started: { label: 'Начался просмотр', description: 'Когда в комнате запустили фильм', icon: 'play' },
  system: { label: 'Системное', description: 'Важные объявления и обновления сервиса', icon: 'bell' },
  news: { label: 'Новости', description: 'Новые функции и события', icon: 'sparkles' },
  marketing: { label: 'Маркетинг', description: 'Акции и специальные предложения', icon: 'flame' },
};

export function typeLabel(type: string): string {
  return PUSH_TYPE_META[type as PushNotificationType]?.label ?? type;
}

// ── Переменные шаблона ───────────────────────────────────────────────────────
export interface VarMeta { key: string; label: string; example: string; }

/** Все известные плейсхолдеры {{...}} с человеческим описанием и примером. */
export const PUSH_VARIABLES: Record<string, VarMeta> = {
  username: { key: 'username', label: 'Имя пользователя', example: 'Аня' },
  message: { key: 'message', label: 'Текст сообщения', example: 'Привет! 👋' },
  roomName: { key: 'roomName', label: 'Название комнаты', example: 'Вечер пятницы' },
  movie: { key: 'movie', label: 'Название фильма', example: '«Начало»' },
  title: { key: 'title', label: 'Заголовок', example: 'Новое обновление' },
  publicId: { key: 'publicId', label: 'Ссылка на профиль', example: 'ab12cd' },
  roomSlug: { key: 'roomSlug', label: 'Ссылка на комнату', example: 'dusk-alps-7f3' },
  conversationId: { key: 'conversationId', label: 'ID диалога (для группировки)', example: 'conv_42' },
  actorId: { key: 'actorId', label: 'ID отправителя (для группировки)', example: 'usr_7' },
};

/**
 * Какие переменные уместны в каждом типе (подсказки в редакторе). Выведено из
 * дефолтных шаблонов сервера (server/src/push/templates.ts).
 */
export const TYPE_VARIABLES: Record<PushNotificationType, string[]> = {
  direct_message: ['username', 'message', 'publicId', 'conversationId'],
  friend_request: ['username', 'actorId'],
  friend_accepted: ['username', 'actorId'],
  room_invite: ['username', 'roomName', 'roomSlug'],
  room_started: ['roomName', 'movie', 'roomSlug'],
  system: ['title', 'message'],
  news: ['title', 'message'],
  marketing: ['title', 'message'],
};

/** Подставить примеры вместо {{var}} для живого предпросмотра. */
export function previewText(text: string): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => PUSH_VARIABLES[key]?.example ?? `{{${key}}}`);
}

// ── Приоритет доставки (urgency) ─────────────────────────────────────────────
export interface UrgencyMeta { value: NotificationTemplateDTO['urgency']; label: string; hint: string; }

export const URGENCY_OPTIONS: UrgencyMeta[] = [
  { value: 'high', label: 'Высокий', hint: 'Показать сразу, можно разбудить экран' },
  { value: 'normal', label: 'Обычный', hint: 'Стандартная доставка' },
  { value: 'low', label: 'Низкий', hint: 'Может немного подождать' },
  { value: 'very-low', label: 'Фоновый', hint: 'Тихо, без спешки, экономит батарею' },
];

export function urgencyLabel(u: string): string {
  return URGENCY_OPTIONS.find((o) => o.value === u)?.label ?? u;
}

// ── Срок жизни (TTL) ─────────────────────────────────────────────────────────
export const TTL_PRESETS: { value: number; label: string }[] = [
  { value: 3600, label: '1 час' },
  { value: 21600, label: '6 часов' },
  { value: 86400, label: '1 день' },
  { value: 259200, label: '3 дня' },
  { value: 604800, label: '7 дней' },
];

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

export function formatTtl(sec: number): string {
  if (sec <= 0) return 'сразу';
  if (sec % 86400 === 0) { const d = sec / 86400; return `${d} ${plural(d, 'день', 'дня', 'дней')}`; }
  if (sec % 3600 === 0) { const h = sec / 3600; return `${h} ${plural(h, 'час', 'часа', 'часов')}`; }
  const m = Math.round(sec / 60);
  return `${m} ${plural(m, 'минута', 'минуты', 'минут')}`;
}

// ── Расшифровки метрик дашборда/аналитики ────────────────────────────────────
export const METRIC_HINTS = {
  totalDevices: 'Все браузеры и телефоны, где хоть раз включали уведомления',
  activeDevices: 'Подписка ещё живая — сюда дойдут пуши',
  usersWithPush: 'Пользователи, разрешившие уведомления',
  usersPushDisabled: 'Выключили уведомления в настройках',
  optIn: 'Доля тех, кто согласился получать уведомления',
  queue: 'Ждут отправки прямо сейчас',
  delivered: 'Дошли до устройств пользователей',
  failed: 'Не доставлены из-за сбоя',
  expired: 'Не успели за отведённый срок жизни',
  rejected: 'Браузер отклонил (подписка недействительна)',
  clicked: 'Пользователи открыли уведомление',
  ctr: 'Доля открытых из доставленных',
} as const;
