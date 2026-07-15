import type { FeatureFlagDTO } from '@vellin/shared';
import { prisma } from '../../db/prisma.js';
import { loadEnv } from '../../env.js';

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
  return [...c.entries()].filter(([, v]) => v).map(([k]) => k);
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
