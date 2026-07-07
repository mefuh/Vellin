/**
 * Отслеживает реальную активность пользователя во вкладке (движение мыши,
 * клавиатура, тач, скролл) — не просто «вкладка открыта». Простой не
 * покрывается — после `IDLE_TIMEOUT_MS` без событий пользователь считается
 * неактивным; уход вкладки в фон (`visibilitychange` → hidden) считается
 * неактивностью немедленно, а не только по таймеру.
 */

const IDLE_TIMEOUT_MS = 60_000;

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'scroll'] as const;

export interface ActivityTracker {
  getActive: () => boolean;
  stop: () => void;
}

export function createActivityTracker(onChange: (active: boolean) => void): ActivityTracker {
  let active = true;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const setActive = (next: boolean): void => {
    if (active === next) return;
    active = next;
    onChange(next);
  };

  const armTimer = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => setActive(false), IDLE_TIMEOUT_MS);
  };

  const onActivity = (): void => {
    if (document.visibilityState !== 'visible') return;
    setActive(true);
    armTimer();
  };

  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') {
      if (timer) clearTimeout(timer);
      setActive(false);
    }
    // Возврат во вкладку сам по себе не активность — ждём реального жеста.
  };

  for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, onActivity, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  armTimer();

  return {
    getActive: () => active,
    stop: () => {
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity);
      document.removeEventListener('visibilitychange', onVisibility);
      if (timer) clearTimeout(timer);
    },
  };
}
