import type { PushNotificationType } from '@vellin/shared';
import { PUSH_TYPE_CATEGORY } from '@vellin/shared';
import { logger } from '../utils/logger.js';
import { isPushEnabled } from './vapid.js';
import { isCategoryEnabled } from './preferences.js';
import { getTemplate } from './templates.js';
import { buildPayload, dmGroupedPreview, type TemplateVars } from './payloads.js';
import { activeSubscriptions, markFailure, markUsed } from './deviceRegistry.js';
import { sendToSubscription } from './webpush.js';
import { enqueue } from './queue.js';
import { allowUser, recordDmAndCount } from './grouping.js';

/**
 * ЕДИНАЯ точка входа push-слоя. Все доменные триггеры зовут это рядом с
 * существующим колокольчиком. Никогда не бросает и не блокирует вызывающего
 * (триггеры зовут через `void`). В Фазе 1 — прямая отправка на активные
 * устройства; в Фазе 2 здесь же подключится постановка в очередь.
 *
 * Порядок: push выключен глобально? → нет VAPID — выходим. Иначе гейтинг по
 * категории (настройки) → антифлуд → рендер шаблона (с группировкой ЛС) →
 * постановка по одной задаче на каждую активную подписку (воркер их разошлёт).
 */
export async function notify(
  recipientId: string,
  type: PushNotificationType,
  vars: TemplateVars,
): Promise<void> {
  try {
    if (!isPushEnabled()) return;
    const category = PUSH_TYPE_CATEGORY[type];
    if (!(await isCategoryEnabled(recipientId, category))) return;
    if (!allowUser(recipientId)) return; // антифлуд

    const tpl = await getTemplate(type);
    if (!tpl) return; // шаблон выключен

    const subs = await activeSubscriptions(recipientId);
    if (subs.length === 0) return;

    // Группировка ЛС: серия сообщений из одного диалога в окне показывается как
    // «N новых сообщений» в одной нотификации (одинаковый tag заменяет её),
    // а dedupeKey не плодит pending-задачи на устройство.
    const finalVars: TemplateVars = { ...vars };
    let dedupeKey: string | undefined;
    if (type === 'direct_message' && typeof vars.conversationId === 'string') {
      const count = recordDmAndCount(recipientId, vars.conversationId);
      finalVars.message = dmGroupedPreview(count, String(vars.message ?? ''));
      finalVars.count = count;
      dedupeKey = `dm:${recipientId}:${vars.conversationId}`;
    }

    const payload = buildPayload(tpl, finalVars);
    await Promise.all(subs.map((sub) => enqueue(recipientId, sub.id, type, payload, dedupeKey)));
  } catch (err) {
    logger.error({ err, recipientId, type }, 'push notify failed');
  }
}

/** Удобный fire-and-forget обёртчик для триггеров (не ждём отправку). */
export function notifyAsync(recipientId: string, type: PushNotificationType, vars: TemplateVars): void {
  void notify(recipientId, type, vars);
}

/**
 * Массовая рассылка с произвольным текстом (админка). Берёт флаги доставки из
 * шаблона типа (иконка/бейдж/ttl/urgency), но title/body/url — заданные
 * админом. Уважает гейтинг категории и наличие подписок. Возвращает true, если
 * пользователю поставлена хотя бы одна задача. Без пер-юзерного антифлуда —
 * это единичный push на пользователя.
 */
export async function broadcastNotify(
  recipientId: string,
  type: PushNotificationType,
  content: { title: string; body: string; url: string },
): Promise<boolean> {
  if (!isPushEnabled()) return false;
  const category = PUSH_TYPE_CATEGORY[type];
  if (!(await isCategoryEnabled(recipientId, category))) return false;
  const tpl = await getTemplate(type);
  if (!tpl) return false;
  const subs = await activeSubscriptions(recipientId);
  if (subs.length === 0) return false;
  // Литеральный контент: рендерим через шаблон с пустыми vars (чистит лишние
  // плейсхолдеры), но title/body/url подменяем на заданные.
  const payload = buildPayload({ ...tpl, title: content.title, body: content.body, url: content.url }, {});
  await Promise.all(subs.map((sub) => enqueue(recipientId, sub.id, type, payload)));
  return true;
}

/**
 * Тестовый push самому себе (кнопка «Отправить тестовое» в настройках). Идёт в
 * обход гейтинга категорий, но уважает наличие активных подписок. Возвращает
 * число устройств, на которые ушла отправка.
 */
export async function sendTestPush(userId: string): Promise<number> {
  if (!isPushEnabled()) return 0;
  const tpl = await getTemplate('system');
  const subs = await activeSubscriptions(userId);
  if (!tpl || subs.length === 0) return 0;
  const payload = buildPayload(tpl, {
    title: 'Vellin',
    message: 'Тестовое уведомление — push работает 🎉',
  });
  let sent = 0;
  await Promise.all(
    subs.map(async (sub) => {
      const res = await sendToSubscription(sub, payload, { ttl: 60, urgency: 'normal' });
      if (res.ok) {
        sent += 1;
        await markUsed(sub.id);
      } else {
        await markFailure(sub.id, res.gone);
      }
    }),
  );
  return sent;
}
