import { readFileSync } from 'node:fs';
import type { ClientPlatform, MinClientVersions } from '@vellin/shared';
import { loadEnv } from './env.js';

/**
 * Версия приложения — читается из package.json в рантайме (а не хардкодится),
 * чтобы /health и /api/config всегда совпадали с реальным релизом. Путь
 * '../package.json' одинаково валиден и в dev (src/appMeta.ts), и в прод-сборке
 * (dist/appMeta.js) — оба файла лежат на один уровень ниже корня server/.
 */
export const APP_VERSION = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
).version;

/** Известные платформы клиента (значения заголовка `X-App-Platform`). */
const PLATFORMS: readonly ClientPlatform[] = ['web', 'windows', 'macos', 'ios', 'android'];

export function isClientPlatform(v: string | undefined): v is ClientPlatform {
  return !!v && (PLATFORMS as readonly string[]).includes(v);
}

/**
 * Минимально поддерживаемые версии клиентов из окружения. Пустая строка =
 * гейтинг для платформы выключен.
 */
export function getMinVersions(): MinClientVersions {
  const env = loadEnv();
  return {
    web: env.MIN_APP_VERSION_WEB,
    windows: env.MIN_APP_VERSION_WINDOWS,
    macos: env.MIN_APP_VERSION_MACOS,
    ios: env.MIN_APP_VERSION_IOS,
    android: env.MIN_APP_VERSION_ANDROID,
  };
}

/**
 * Сравнение semver-версий вида `major.minor.patch` (пре-релизные суффиксы после
 * `-` игнорируются). Возвращает -1/0/1. Некорректные части трактуются как 0,
 * поэтому неполные версии (`1`, `1.2`) сравниваются корректно.
 */
export function compareSemver(a: string, b: string): number {
  const norm = (v: string): number[] =>
    v
      .trim()
      .split('-')[0]
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0);
  const pa = norm(a);
  const pb = norm(b);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * Устарел ли клиент. Гейтинг применяется только если для платформы задана
 * непустая минимальная версия И клиент прислал свою версию. Отсутствие версии
 * при заданном минимуме трактуется как устаревший клиент (нативные приложения
 * обязаны представляться; старые сборки без заголовка — кандидаты на апдейт).
 */
export function isClientOutdated(platform: ClientPlatform, version: string | undefined): boolean {
  const min = getMinVersions()[platform];
  if (!min) return false;
  if (!version) return true;
  return compareSemver(version, min) < 0;
}
