/**
 * Форматирование длительности «совместного времени» с русским склонением.
 * Только минуты и часы — БЕЗ дней (часы растут сколь угодно: «317 часов»):
 *   < 1 часа → «N минут»
 *   ≥ 1 часа → «H часов M минут»
 * Ноль минут в «H часов 0 минут» опускается («5 часов»), чтобы не мозолил глаз.
 */

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

function minutes(m: number): string {
  return `${m} ${plural(m, [...MIN])}`;
}
function hours(h: number): string {
  return `${h} ${plural(h, [...HOUR])}`;
}

/** Человекочитаемая длительность из секунд (см. описание модуля). */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const totalMinutes = Math.floor(s / 60);

  if (totalMinutes < 60) {
    return minutes(totalMinutes); // включая «0 минут» для пустого/старта
  }
  const totalHours = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0 ? `${hours(totalHours)} ${minutes(m)}` : hours(totalHours);
}

/**
 * Разбор для крупного числа в центре кольца: главная величина + её единица +
 * (опц.) вторая строка помельче. Меняется по мере роста (мин → ч), чтобы
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
  const rm = m % 60;
  return { big: String(h), unit: plural(h, [...HOUR]), sub: rm > 0 ? minutes(rm) : null };
}

/** Компактный вид для вторичных чипов: «3 ч 12 мин», «45 мин», «120 ч». */
export function formatDurationShort(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h} ч ${rm} мин` : `${h} ч`;
}
