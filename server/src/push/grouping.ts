/**
 * Группировка/антиспам push (in-memory; для одного процесса — при выносе воркера
 * наружу логику переносим в БД/Redis). Два механизма:
 *  1) счётчик ЛС на (получатель, диалог) в окне — чтобы серия сообщений показывала
 *     «N новых сообщений» в одной нотификации (одинаковый tag заменяет её);
 *  2) пер-юзерный rate-limit (token bucket) — потолок частоты push.
 */

const DM_WINDOW_MS = 30_000;
const dmCounts = new Map<string, { count: number; timer: ReturnType<typeof setTimeout> }>();

/** Учесть новое ЛС и вернуть текущий счётчик серии (сбрасывается после окна). */
export function recordDmAndCount(userId: string, conversationId: string): number {
  const key = `${userId}:${conversationId}`;
  const cur = dmCounts.get(key);
  const count = (cur?.count ?? 0) + 1;
  if (cur?.timer) clearTimeout(cur.timer);
  const timer = setTimeout(() => dmCounts.delete(key), DM_WINDOW_MS);
  if (typeof timer.unref === 'function') timer.unref();
  dmCounts.set(key, { count, timer });
  return count;
}

/** Сбросить счётчик серии (например, диалог прочитан). */
export function resetDmCount(userId: string, conversationId: string): void {
  const key = `${userId}:${conversationId}`;
  const cur = dmCounts.get(key);
  if (cur?.timer) clearTimeout(cur.timer);
  dmCounts.delete(key);
}

// ── Rate limit (token bucket) ──────────────────────────────────────────────
const RATE = 60; // пушей
const WINDOW_MS = 60_000; // за минуту
const buckets = new Map<string, { tokens: number; last: number }>();

/** Разрешить отправку push этому пользователю прямо сейчас (антифлуд). */
export function allowUser(userId: string): boolean {
  const now = Date.now();
  const b = buckets.get(userId) ?? { tokens: RATE, last: now };
  const refill = ((now - b.last) / WINDOW_MS) * RATE;
  b.tokens = Math.min(RATE, b.tokens + refill);
  b.last = now;
  if (b.tokens < 1) {
    buckets.set(userId, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(userId, b);
  return true;
}
