/**
 * Форматирование длительности «совместного времени» с русским склонением и
 * авто-подбором единиц:
 *   < 1 часа   → «N минут»
 *   < 2 суток  → «H часов M минут» (десятки часов впечатляют сильнее, чем «1 день»)
 *   ≥ 2 суток  → «D дней H часов»
 * Ноль минут в «H часов 0 минут» опускается («5 часов»), чтобы не мозолил глаз.
 */

/** Порог (часы) перехода отображения с часов на дни. */
const DAYS_AT_HOURS = 48;

/** Русское склонение слова по числу: [одна, две-четыре, пять+]. */
function plural(n: number, forms: [string, string, string]): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

const MIN = ['минута', 'минуты', 'минут'] as const;
const HOUR = ['час', 'часа', 'часов'] as const;
const DAY = ['день', 'дня', 'дней'] as const;

function minutes(m: number): string {
  return `${m} ${plural(m, [...MIN])}`;
}
function hours(h: number): string {
  return `${h} ${plural(h, [...HOUR])}`;
}
function days(d: number): string {
  return `${d} ${plural(d, [...DAY])}`;
}

/** Человекочитаемая длительность из секунд (см. описание модуля). */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const totalMinutes = Math.floor(s / 60);

  if (totalMinutes < 60) {
    return minutes(totalMinutes); // включая «0 минут» для пустого/старта
  }

  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < DAYS_AT_HOURS) {
    const m = totalMinutes % 60;
    return m > 0 ? `${hours(totalHours)} ${minutes(m)}` : hours(totalHours);
  }

  const d = Math.floor(totalHours / 24);
  const h = totalHours % 24;
  return h > 0 ? `${days(d)} ${hours(h)}` : days(d);
}

/**
 * Разбор для крупного числа в центре кольца: главная величина + её единица +
 * (опц.) вторая строка помельче. Меняется по мере роста (мин → ч → дни), чтобы
 * count-up красиво «переключал» единицы.
 */
export interface HeroParts {
  big: string;
  unit: string;
  sub: string | null;
}
export function heroParts(totalSeconds: number): HeroParts {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  if (m < 60) return { big: String(m), unit: plural(m, [...MIN]), sub: null };
  const h = Math.floor(m / 60);
  if (h < DAYS_AT_HOURS) {
    const rm = m % 60;
    return { big: String(h), unit: plural(h, [...HOUR]), sub: rm > 0 ? minutes(rm) : null };
  }
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return { big: String(d), unit: plural(d, [...DAY]), sub: rh > 0 ? hours(rh) : null };
}

/** Компактный вид для вторичных чипов: «3 ч 12 мин», «45 мин», «2 д 4 ч». */
export function formatDurationShort(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  if (h < 24) {
    const rm = m % 60;
    return rm > 0 ? `${h} ч ${rm} мин` : `${h} ч`;
  }
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d} д ${rh} ч` : `${d} д`;
}
