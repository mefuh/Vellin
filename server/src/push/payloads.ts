import type { NotificationTemplateDTO, PushPayload, PushNotificationType } from '@vellin/shared';
import { renderTemplate } from './templates.js';

/** Переменные шаблона: плоская карта (имя → значение) из контекста события. */
export type TemplateVars = Record<string, string | number | undefined>;

/**
 * Собрать готовую к отправке полезную нагрузку из шаблона и переменных.
 * Рендерит title/body/url/tag; иконка/бейдж/флаги берутся из шаблона.
 */
export function buildPayload(
  tpl: NotificationTemplateDTO,
  vars: TemplateVars,
  jobId?: string,
): PushPayload {
  const url = renderTemplate(tpl.url, vars) || '/';
  return {
    type: tpl.type,
    title: renderTemplate(tpl.title, vars) || 'Vellin',
    body: renderTemplate(tpl.body, vars),
    icon: tpl.icon,
    badge: tpl.badge,
    image: tpl.image ?? undefined,
    tag: tpl.tag ? renderTemplate(tpl.tag, vars) : undefined,
    requireInteraction: tpl.requireInteraction,
    silent: tpl.silent,
    renotify: !!tpl.tag,
    data: { type: tpl.type, url, jobId },
  };
}

/**
 * Текст превью для push о ЛС: текст сообщения, либо «📷 Фотография» / «🎤
 * Голосовое сообщение» для вложений без текста.
 */
export function dmPushPreview(body: string, hasImage: boolean, hasVoice: boolean): string {
  const text = body.trim();
  if (text) return text.slice(0, 140);
  if (hasImage) return '📷 Фотография';
  if (hasVoice) return '🎤 Голосовое сообщение';
  return 'Новое сообщение';
}

/** Сводный текст коалесцированного push о ЛС (несколько сообщений подряд). */
export function dmGroupedPreview(count: number, latest: string): string {
  if (count <= 1) return latest;
  return `${count} новых сообщений`;
}

/** Типы, идущие отдельной нотификацией ОС (а не заменой по tag). */
export const PER_EVENT_TYPES: PushNotificationType[] = ['friend_request', 'friend_accepted', 'room_invite'];
