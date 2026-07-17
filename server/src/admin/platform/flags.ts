import { FEATURE_FLAG_REPORTS, type FeatureFlagDTO } from '@vellin/shared';
import { prisma } from '../../db/prisma.js';
import { loadEnv } from '../../env.js';

/**
 * Well-known флаги с осмысленным дефолтом. Засеиваются при старте (идемпотентно,
 * без перезаписи выбора админа), а также подмешиваются в {@link enabledFlagKeys}
 * как включённые, если строки ещё нет — чтобы функционал по умолчанию не пропадал
 * из-за отсутствующей записи.
 */
const DEFAULT_FLAGS: Array<{ key: string; enabled: boolean; description: string }> = [
  {
    key: FEATURE_FLAG_REPORTS,
    enabled: true,
    description: 'Приём жалоб от пользователей. Выключение полностью скрывает жалобы: кнопку в профиле, форму и админ-раздел «Жалобы».',
  },
];

// Кэш флагов в памяти: key → enabled. Инвалидируется при любой записи.
let cache: Map<string, boolean> | null = null;

async function ensureCache(): Promise<Map<string, boolean>> {
  if (cache) return cache;
  const rows = await prisma.featureFlag.findMany({ select: { key: true, enabled: true } });
  cache = new Map(rows.map((r) => [r.key, r.enabled]));
  return cache;
}

export function invalidateFlags(): void {
  cache = null;
}

/** Включён ли флаг. Если строки нет — fallback (по умолчанию false). */
export async function isFeatureEnabled(key: string, fallback = false): Promise<boolean> {
  const c = await ensureCache();
  return c.has(key) ? c.get(key)! : fallback;
}

/** Ключи включённых флагов — для публичного runtime. */
export async function enabledFlagKeys(): Promise<string[]> {
  const c = await ensureCache();
  const keys = new Set([...c.entries()].filter(([, v]) => v).map(([k]) => k));
  // Well-known флаги с дефолтом «включён» считаем включёнными, пока явной строки
  // нет — это защищает от исчезновения функционала до сидирования/при пустой БД.
  for (const d of DEFAULT_FLAGS) if (d.enabled && !c.has(d.key)) keys.add(d.key);
  return [...keys];
}

/**
 * Идемпотентно засеять well-known флаги при старте: создаёт недостающие строки,
 * но НЕ трогает enabled уже существующих (уважает выбор администратора).
 */
export async function seedDefaultFlags(): Promise<void> {
  for (const d of DEFAULT_FLAGS) {
    await prisma.featureFlag.upsert({
      where: { key: d.key },
      create: { key: d.key, enabled: d.enabled, description: d.description, updatedBy: 'system' },
      update: {},
    });
  }
  invalidateFlags();
}

/**
 * Включена ли модерация ЛС. Если задан флаг 'moderation.dm' — он главнее;
 * иначе fallback на env DM_MODERATION_ENABLED (совместимость Этапа 4).
 */
export async function isDmModerationEnabled(): Promise<boolean> {
  const c = await ensureCache();
  if (c.has('moderation.dm')) return c.get('moderation.dm')!;
  return loadEnv().DM_MODERATION_ENABLED;
}

export function toFlagDTO(r: { key: string; enabled: boolean; description: string | null; updatedAt: Date }): FeatureFlagDTO {
  return { key: r.key, enabled: r.enabled, description: r.description, updatedAt: r.updatedAt.toISOString() };
}

export async function listFlags(): Promise<FeatureFlagDTO[]> {
  const rows = await prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
  return rows.map(toFlagDTO);
}

export async function upsertFlag(key: string, enabled: boolean, description: string | null | undefined, updatedBy: string): Promise<FeatureFlagDTO> {
  const row = await prisma.featureFlag.upsert({
    where: { key },
    create: { key, enabled, description: description ?? null, updatedBy },
    update: { enabled, ...(description !== undefined ? { description } : {}), updatedBy },
  });
  invalidateFlags();
  return toFlagDTO(row);
}

export async function deleteFlag(key: string): Promise<boolean> {
  const res = await prisma.featureFlag.deleteMany({ where: { key } });
  invalidateFlags();
  return res.count > 0;
}
