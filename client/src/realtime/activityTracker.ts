/**
 * Отслеживает реальную активность пользователя во вкладке (движение мыши,
 * клавиатура, тач, скролл) — не просто «вкладка открыта». Простой не
 * покрывается: после `idleMs` без событий пользователь считается неактивным;
 * уход вкладки в фон (`visibilitychange` → hidden) считается неактивностью
 * немедленно, а не только по таймеру.
 *
 * Порог простоя и признак «держать онлайн несмотря на простой» задаёт политика
 * (`getPolicy`): в комнате с играющим видео или в звонке пользователь остаётся
 * онлайн, даже если ничего не трогает — он реально смотрит/разговаривает.
 */

/** Простой вне комнаты. */
export const IDLE_TIMEOUT_MS = 60_000;
/** Простой в комнате, где ничего не играет и нет звонка. */
export const ROOM_IDLE_TIMEOUT_MS = 5 * 60_000;

/** Как часто перепроверяем простой (политика может смениться без событий). */
const TICK_MS = 5_000;

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'scroll'] as const;

export interface ActivityPolicy {
  /** Сколько миллисекунд бездействия считать уходом в офлайн. */
  idleMs: number;
  /** Держать онлайн независимо от простоя и скрытой вкладки. */
  keepAlive: boolean;
}

export interface ActivityTracker {
  getActive: () => boolean;
  /** Пересчитать состояние (например, после смены политики). */
  refresh: () => void;
  stop: () => void;
}

export function createActivityTracker(
  onChange: (active: boolean) => void,
  getPolicy: () => ActivityPolicy = () => ({ idleMs: IDLE_TIMEOUT_MS, keepAlive: false }),
): ActivityTracker {
  let active = true;
  let lastActivityAt = Date.now();

  const compute = (): boolean => {
    const policy = getPolicy();
    if (policy.keepAlive) return true;
    if (document.visibilityState === 'hidden') return false;
    return Date.now() - lastActivityAt < policy.idleMs;
  };

  const evaluate = (): void => {
    const next = compute();
    if (active === next) return;
    active = next;
    onChange(next);
  };

  const onActivity = (): void => {
    if (document.visibilityState !== 'visible') return;
    lastActivityAt = Date.now();
    evaluate();
  };

  // Возврат во вкладку сам по себе не активность — ждём реального жеста.
  const onVisibility = (): void => evaluate();

  for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, onActivity, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  const tick = setInterval(evaluate, TICK_MS);

  return {
    getActive: () => active,
    refresh: evaluate,
    stop: () => {
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(tick);
    },
  };
}
