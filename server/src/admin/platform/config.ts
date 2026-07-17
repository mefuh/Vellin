import type {
  PlatformLimits,
  PlatformMaintenance,
  PlatformSettingsDTO,
  PlatformToggles,
  UpdatePlatformSettingsRequest,
} from '@vellin/shared';
import { prisma } from '../../db/prisma.js';

// Значения по умолчанию — используются, пока строка настройки не сохранена.
const DEFAULT_TOGGLES: PlatformToggles = {
  registration: true,
  guests: true,
  roomCreation: true,
  roomChat: true,
  reactions: true,
  calls: true,
  playlists: true,
  directMessages: true,
  friends: true,
  invites: true,
  uploads: true,
  favorites: true,
  push: true,
};
const DEFAULT_MAINTENANCE: PlatformMaintenance = { enabled: false, message: '' };
const DEFAULT_LIMITS: PlatformLimits = {
  maxRoomParticipants: 50,
  avatarMaxMb: 5,
  dmImageMaxMb: 10,
  dmVoiceMaxMb: 25,
  dmVideoMaxMb: 128,
};

// Настройки хранятся тремя JSON-строками (ключи-секции) и кэшируются в памяти.
let cache: PlatformSettingsDTO | null = null;

function parse<T>(json: string | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return { ...fallback, ...(JSON.parse(json) as Partial<T>) };
  } catch {
    return fallback;
  }
}

/** Полные настройки платформы (с дефолтами). Кэшируется до инвалидации. */
export async function getSettings(): Promise<PlatformSettingsDTO> {
  if (cache) return cache;
  const rows = await prisma.platformSetting.findMany({ where: { key: { in: ['toggles', 'maintenance', 'limits'] } } });
  const byKey = new Map(rows.map((r) => [r.key, r.valueJson]));
  cache = {
    toggles: parse(byKey.get('toggles'), DEFAULT_TOGGLES),
    maintenance: parse(byKey.get('maintenance'), DEFAULT_MAINTENANCE),
    limits: parse(byKey.get('limits'), DEFAULT_LIMITS),
  };
  return cache;
}

/** Сбрасывает кэш (вызывается после записи). */
export function invalidateSettings(): void {
  cache = null;
}

/** Обновляет настройки (частично, по секциям) и инвалидирует кэш. */
export async function updateSettings(
  patch: UpdatePlatformSettingsRequest,
  updatedBy: string,
): Promise<PlatformSettingsDTO> {
  const current = await getSettings();
  const next: PlatformSettingsDTO = {
    toggles: { ...current.toggles, ...(patch.toggles ?? {}) },
    maintenance: { ...current.maintenance, ...(patch.maintenance ?? {}) },
    limits: { ...current.limits, ...(patch.limits ?? {}) },
  };
  const write = async (key: string, value: unknown): Promise<void> => {
    const valueJson = JSON.stringify(value);
    await prisma.platformSetting.upsert({
      where: { key },
      create: { key, valueJson, updatedBy },
      update: { valueJson, updatedBy },
    });
  };
  await Promise.all([
    patch.toggles ? write('toggles', next.toggles) : Promise.resolve(),
    patch.maintenance ? write('maintenance', next.maintenance) : Promise.resolve(),
    patch.limits ? write('limits', next.limits) : Promise.resolve(),
  ]);
  invalidateSettings();
  return next;
}

// ── Быстрые типизированные геттеры (для enforcement в роутах) ────────────────
export async function getToggles(): Promise<PlatformToggles> {
  return (await getSettings()).toggles;
}
export async function getMaintenance(): Promise<PlatformMaintenance> {
  return (await getSettings()).maintenance;
}
