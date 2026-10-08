/**
 * Демонстрация экрана в личном звонке: пресеты качества и их запоминание.
 *
 * Значения повторяют клиент для Windows (`webrtc/screen_share.dart`): те же
 * разрешения, частоты и потолки битрейта, чтобы собеседник получал одинаковую
 * картинку, с чего бы её ни показывали.
 */

export type ScreenResolution = 'auto' | 'p720' | 'p1080' | 'p1440' | 'p2160';
export type ScreenFps = 15 | 30 | 60;

/**
 * Что показывать. Сайт не может перечислить экраны и окна сам — это делает
 * системное окно браузера; поверхность здесь только подсказка, какую вкладку
 * этого окна открыть первой.
 */
export type ScreenSurface = 'monitor' | 'window' | 'browser';

export interface ScreenShareOptions {
  resolution: ScreenResolution;
  fps: ScreenFps;
  withAudio: boolean;
}

export const SCREEN_RESOLUTIONS: { value: ScreenResolution; label: string }[] = [
  { value: 'auto', label: 'Авто' },
  { value: 'p720', label: '720p' },
  { value: 'p1080', label: '1080p' },
  { value: 'p1440', label: '1440p' },
  { value: 'p2160', label: '4K' },
];

export const SCREEN_FPS: { value: ScreenFps; label: string }[] = [
  { value: 15, label: '15' },
  { value: 30, label: '30' },
  { value: 60, label: '60' },
];

const SIZES: Record<ScreenResolution, { width: number; height: number } | null> = {
  auto: null,
  p720: { width: 1280, height: 720 },
  p1080: { width: 1920, height: 1080 },
  p1440: { width: 2560, height: 1440 },
  p2160: { width: 3840, height: 2160 },
};

export const resolutionLabel = (r: ScreenResolution): string =>
  SCREEN_RESOLUTIONS.find((x) => x.value === r)?.label ?? '';

/** Ограничения захвата. «Авто» потолка не задаёт: картинка идёт как есть. */
export function screenVideoConstraints(o: ScreenShareOptions): MediaTrackConstraints {
  const size = SIZES[o.resolution];
  return {
    frameRate: { ideal: o.fps, max: o.fps },
    ...(size ? { width: { max: size.width }, height: { max: size.height } } : {}),
  };
}

/**
 * Потолок битрейта, бит/с. Выше этих значений выигрыш уже незаметен, а канал
 * страдает — и первым начинает рваться голос. «Авто» считаем за 1080p.
 */
export function screenMaxBitrate(o: ScreenShareOptions): number {
  const base =
    o.resolution === 'p720'
      ? 3_000_000
      : o.resolution === 'p1440'
        ? 10_000_000
        : o.resolution === 'p2160'
          ? 16_000_000
          : 6_000_000;
  if (o.fps <= 15) return Math.round(base * 0.6);
  if (o.fps >= 60) return Math.round(base * 1.35);
  return base;
}

const STORAGE_KEY = 'vellin:screen-share';
const DEFAULTS: ScreenShareOptions = { resolution: 'p1080', fps: 30, withAudio: true };

/** Последние выбранные настройки — следующая демонстрация начнётся с них. */
export function loadScreenOptions(): ScreenShareOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const v = JSON.parse(raw) as Partial<ScreenShareOptions>;
    return {
      resolution: SCREEN_RESOLUTIONS.some((r) => r.value === v.resolution)
        ? (v.resolution as ScreenResolution)
        : DEFAULTS.resolution,
      fps: v.fps === 15 || v.fps === 30 || v.fps === 60 ? v.fps : DEFAULTS.fps,
      withAudio: typeof v.withAudio === 'boolean' ? v.withAudio : DEFAULTS.withAudio,
    };
  } catch {
    return DEFAULTS;
  }
}

export function saveScreenOptions(o: ScreenShareOptions): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
  } catch {
    /* хранилище недоступно — в следующий раз начнём с умолчаний */
  }
}

/**
 * Умеет ли браузер показывать экран. На телефонах `getDisplayMedia` нет —
 * там кнопки демонстрации не будет вовсе.
 */
export const canShareScreen = (): boolean =>
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices &&
  typeof navigator.mediaDevices.getDisplayMedia === 'function' &&
  !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
