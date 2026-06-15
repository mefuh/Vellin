import type {
  PrivacyCategory,
  PrivacyRule,
  PrivacySettings,
  PrivacyVisibility,
} from '@vellin/shared';
import { PRIVACY_CATEGORIES, defaultPrivacySettings } from '@vellin/shared';

const VISIBILITIES: readonly PrivacyVisibility[] = ['everyone', 'friends', 'nobody'];
const MAX_EXCEPTIONS = 200;

function sanitizeRule(raw: unknown): PrivacyRule {
  const r = (raw ?? {}) as Partial<PrivacyRule>;
  const visibility = VISIBILITIES.includes(r.visibility as PrivacyVisibility)
    ? (r.visibility as PrivacyVisibility)
    : 'everyone';
  const clean = (arr: unknown): string[] =>
    Array.isArray(arr)
      ? [...new Set(arr.filter((x): x is string => typeof x === 'string'))].slice(0, MAX_EXCEPTIONS)
      : [];
  const allow = clean(r.allow);
  const denySet = new Set(clean(r.deny));
  // deny перекрывает allow — один и тот же id не держим в обоих списках.
  return { visibility, allow: allow.filter((id) => !denySet.has(id)), deny: [...denySet] };
}

/** Распарсить privacyJson из БД, дополнив отсутствующие категории дефолтами. */
export function parsePrivacy(json: string | null | undefined): PrivacySettings {
  const base = defaultPrivacySettings();
  if (!json) return base;
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    for (const cat of PRIVACY_CATEGORIES) {
      if (parsed[cat] !== undefined) base[cat] = sanitizeRule(parsed[cat]);
    }
  } catch {
    /* битый JSON → дефолты */
  }
  return base;
}

/** Сериализовать настройки для записи в БД (с санитизацией). */
export function serializePrivacy(settings: PrivacySettings): string {
  const out = defaultPrivacySettings();
  for (const cat of PRIVACY_CATEGORIES) out[cat] = sanitizeRule(settings[cat]);
  return JSON.stringify(out);
}

export interface ViewerContext {
  /** Зритель — сам владелец данных. */
  isSelf: boolean;
  /** Зритель — принятый друг владельца. */
  isFriend: boolean;
  /** id зрителя (null — аноним/гость). */
  viewerId: string | null;
}

/** Видит ли зритель категорию по правилу владельца. */
export function canSee(rule: PrivacyRule, ctx: ViewerContext): boolean {
  if (ctx.isSelf) return true;
  const vid = ctx.viewerId;
  if (vid && rule.deny.includes(vid)) return false;
  if (vid && rule.allow.includes(vid)) return true;
  switch (rule.visibility) {
    case 'everyone':
      return true;
    case 'friends':
      return ctx.isFriend;
    case 'nobody':
      return false;
    default:
      return true;
  }
}

/** Тип-хелпер: категория есть в настройках. */
export function ruleOf(settings: PrivacySettings, cat: PrivacyCategory): PrivacyRule {
  return settings[cat] ?? { visibility: 'everyone', allow: [], deny: [] };
}
