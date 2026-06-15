import type { Gender } from '@vellin/shared';

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

const pad = (n: number) => String(n).padStart(2, '0');

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Относительная фраза времени последнего захода в стиле Telegram:
 * «только что», «5 минут назад», «2 часа назад», «вчера в 14:30», «21.01.26».
 */
export function lastSeenPhrase(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const diff = Math.max(0, now.getTime() - then.getTime());
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  if (diff < MIN) return 'только что';
  if (diff < HOUR) {
    const m = Math.floor(diff / MIN);
    return `${m} ${plural(m, 'минуту', 'минуты', 'минут')} назад`;
  }
  if (diff < DAY && isSameDay(then, now)) {
    const h = Math.floor(diff / HOUR);
    return `${h} ${plural(h, 'час', 'часа', 'часов')} назад`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(then, yesterday)) return `вчера в ${pad(then.getHours())}:${pad(then.getMinutes())}`;

  return `${pad(then.getDate())}.${pad(then.getMonth() + 1)}.${String(then.getFullYear()).slice(2)}`;
}

/** Глагол с учётом пола: «был» / «была» / «был(а)». */
export function seenVerb(gender: Gender | null): string {
  return gender === 'female' ? 'была' : gender === 'male' ? 'был' : 'был(а)';
}

/** Полная строка статуса для офлайна, либо null если время неизвестно. */
export function lastSeenLabel(iso: string | null, gender: Gender | null): string {
  if (!iso) return 'не в сети';
  return `${seenVerb(gender)} в сети ${lastSeenPhrase(iso)}`;
}
