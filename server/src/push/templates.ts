import type { NotificationTemplateDTO, PushNotificationType } from '@vellin/shared';
import { prisma } from '../db/prisma.js';

/**
 * Дефолтные шаблоны по типу. Засеиваются идемпотентно при старте (upsert по
 * type) — после этого редактируются из админки (Фаза 3). Переменные {{...}}
 * подставляются из контекста события рендером.
 */
export const DEFAULT_TEMPLATES: Record<PushNotificationType, Omit<NotificationTemplateDTO, 'updatedAt'>> = {
  direct_message: {
    type: 'direct_message',
    title: '{{username}}',
    body: '{{message}}',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    image: null,
    url: '/messages/{{username}}',
    sound: null,
    ttl: 86400,
    urgency: 'high',
    requireInteraction: false,
    tag: 'dm-{{conversationId}}',
    silent: false,
    enabled: true,
  },
  friend_request: {
    type: 'friend_request',
    title: 'Заявка в друзья',
    body: '{{username}} отправил вам заявку в друзья',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    image: null,
    url: '/friends',
    sound: null,
    ttl: 604800,
    urgency: 'normal',
    requireInteraction: false,
    tag: 'friend-request-{{actorId}}',
    silent: false,
    enabled: true,
  },
  friend_accepted: {
    type: 'friend_accepted',
    title: 'Заявка принята',
    body: '{{username}} принял вашу заявку',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    image: null,
    url: '/friends',
    sound: null,
    ttl: 604800,
    urgency: 'normal',
    requireInteraction: false,
    tag: 'friend-accepted-{{actorId}}',
    silent: false,
    enabled: true,
  },
  room_invite: {
    type: 'room_invite',
    title: 'Приглашение в комнату',
    body: '{{username}} приглашает вас в комнату «{{roomName}}»',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    image: null,
    url: '/room/{{roomSlug}}',
    sound: null,
    ttl: 86400,
    urgency: 'high',
    requireInteraction: true,
    tag: 'room-invite-{{roomSlug}}',
    silent: false,
    enabled: true,
  },
  room_started: {
    type: 'room_started',
    title: 'Начался просмотр',
    body: 'В комнате «{{roomName}}» запустили {{movie}}',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    image: null,
    url: '/room/{{roomSlug}}',
    sound: null,
    ttl: 3600,
    urgency: 'high',
    requireInteraction: false,
    tag: 'room-started-{{roomSlug}}',
    silent: false,
    enabled: true,
  },
  system: {
    type: 'system',
    title: '{{title}}',
    body: '{{message}}',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    image: null,
    url: '/',
    sound: null,
    ttl: 86400,
    urgency: 'normal',
    requireInteraction: false,
    tag: null,
    silent: false,
    enabled: true,
  },
  news: {
    type: 'news',
    title: '{{title}}',
    body: '{{message}}',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    image: null,
    url: '/',
    sound: null,
    ttl: 86400,
    urgency: 'low',
    requireInteraction: false,
    tag: null,
    silent: false,
    enabled: true,
  },
  marketing: {
    type: 'marketing',
    title: '{{title}}',
    body: '{{message}}',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    image: null,
    url: '/',
    sound: null,
    ttl: 86400,
    urgency: 'very-low',
    requireInteraction: false,
    tag: null,
    silent: false,
    enabled: true,
  },
};

const cache = new Map<PushNotificationType, NotificationTemplateDTO>();

function rowToDto(row: {
  type: string;
  title: string;
  body: string;
  icon: string;
  badge: string;
  image: string | null;
  url: string;
  sound: string | null;
  ttl: number;
  urgency: string;
  requireInteraction: boolean;
  tag: string | null;
  silent: boolean;
  enabled: boolean;
  updatedAt: Date;
}): NotificationTemplateDTO {
  return {
    type: row.type as PushNotificationType,
    title: row.title,
    body: row.body,
    icon: row.icon,
    badge: row.badge,
    image: row.image,
    url: row.url,
    sound: row.sound,
    ttl: row.ttl,
    urgency: row.urgency as NotificationTemplateDTO['urgency'],
    requireInteraction: row.requireInteraction,
    tag: row.tag,
    silent: row.silent,
    enabled: row.enabled,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Идемпотентно создать недостающие дефолтные шаблоны (вызывается при старте). */
export async function seedDefaultTemplates(): Promise<void> {
  for (const tpl of Object.values(DEFAULT_TEMPLATES)) {
    await prisma.notificationTemplate.upsert({
      where: { type: tpl.type },
      create: { ...tpl },
      update: {}, // существующие (возможно отредактированные) не трогаем
    });
  }
  cache.clear();
}

/** Получить шаблон по типу (с in-memory кэшем). null — шаблон выключен/отсутствует. */
export async function getTemplate(type: PushNotificationType): Promise<NotificationTemplateDTO | null> {
  const cached = cache.get(type);
  if (cached) return cached.enabled ? cached : null;
  const row = await prisma.notificationTemplate.findUnique({ where: { type } });
  if (!row) {
    const def = DEFAULT_TEMPLATES[type];
    return def ? { ...def, updatedAt: new Date(0).toISOString() } : null;
  }
  const dto = rowToDto(row);
  cache.set(type, dto);
  return dto.enabled ? dto : null;
}

/** Сбросить кэш шаблонов (после правки из админки). */
export function invalidateTemplateCache(): void {
  cache.clear();
}

/** Подстановка {{var}} → значение. Неизвестные плейсхолдеры убираем. */
export function renderTemplate(text: string, vars: Record<string, string | number | undefined>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? '' : String(v);
  });
}
