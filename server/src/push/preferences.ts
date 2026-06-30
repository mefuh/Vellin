import type {
  NotificationPreferenceDTO,
  PushCategory,
  UpdatePreferencesRequest,
} from '@vellin/shared';
import { PUSH_CATEGORIES } from '@vellin/shared';
import { prisma } from '../db/prisma.js';

const ALL_CATEGORIES = PUSH_CATEGORIES.map((c) => c.id);

function parseCategories(json: string): Record<PushCategory, boolean> {
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(json) as Record<string, unknown>;
  } catch {
    raw = {};
  }
  // Отсутствие ключа = включено. Так новые категории включены по умолчанию.
  const out = {} as Record<PushCategory, boolean>;
  for (const id of ALL_CATEGORIES) out[id] = raw[id] !== false;
  return out;
}

/** Настройки пользователя (с дефолтами, если строки ещё нет). */
export async function getPreferences(userId: string): Promise<NotificationPreferenceDTO> {
  const row = await prisma.notificationPreference.findUnique({ where: { userId } });
  return {
    pushEnabled: row ? row.pushEnabled : true,
    categories: parseCategories(row?.categoriesJson ?? '{}'),
  };
}

/** Обновить настройки (частично). Возвращает актуальное состояние. */
export async function updatePreferences(
  userId: string,
  patch: UpdatePreferencesRequest,
): Promise<NotificationPreferenceDTO> {
  const current = await getPreferences(userId);
  const nextCategories = { ...current.categories, ...(patch.categories ?? {}) };
  const pushEnabled = patch.pushEnabled ?? current.pushEnabled;
  await prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, pushEnabled, categoriesJson: JSON.stringify(nextCategories) },
    update: { pushEnabled, categoriesJson: JSON.stringify(nextCategories) },
  });
  return { pushEnabled, categories: nextCategories };
}

/**
 * Разрешена ли отправка push указанной категории этому пользователю. Главный
 * выключатель глушит всё; иначе смотрим конкретную категорию.
 */
export async function isCategoryEnabled(userId: string, category: PushCategory): Promise<boolean> {
  const prefs = await getPreferences(userId);
  if (!prefs.pushEnabled) return false;
  return prefs.categories[category] !== false;
}
