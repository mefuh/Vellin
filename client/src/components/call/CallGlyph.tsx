/**
 * Иконки экрана звонка.
 *
 * Пути перенесены дословно из клиента для Windows
 * (winapp/lib/widgets/call/call_glyphs.dart), а те — из макета: обводочная
 * графика толщиной 1.25 со своими пропорциями. Общий набор иконок сайта её не
 * повторяет, поэтому у звонка свой.
 */

interface Stroke {
  d: string;
  w?: number;
}

interface Glyph {
  /** Сторона квадрата координат — `viewBox` из макета. */
  box: number;
  strokes?: Stroke[];
  fills?: string[];
  /** Поворот вокруг центра в градусах (трубка сброса). */
  rotate?: number;
}

/** Прямоугольник со скруглением как путь — макет задаёт их тегом `rect`. */
const rect = (x: number, y: number, w: number, h: number, r: number): string =>
  `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}` +
  `A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}` +
  `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;

const circle = (cx: number, cy: number, r: number): string =>
  `M${cx - r} ${cy}A${r} ${r} 0 0 1 ${cx + r} ${cy}A${r} ${r} 0 0 1 ${cx - r} ${cy}Z`;

const HANDSET =
  'M7.6 3.4c-.5-.9-1.6-1.2-2.5-.8l-1.4.7C2.6 3.9 2 5.1 2.2 6.3c.6 3.5 2.3 6.8 4.9 9.4 2.6 2.6 5.9 4.3 9.4 4.9 1.2.2 2.4-.4 2.9-1.5l.7-1.4c.4-.9.1-2-.8-2.5l-2.7-1.6c-.8-.5-1.9-.3-2.5.5l-.9 1.1c-1.4-.7-2.7-1.6-3.8-2.7-1.1-1.1-2-2.4-2.7-3.8l1.1-.9c.8-.6 1-1.7.5-2.5L7.6 3.4z';

const CAMERA_BODY = rect(1.6, 4.6, 10, 8.8, 2.2);
const CAMERA_LENS = 'M11.6 9l4.8-2.8v5.6L11.6 9z';

export const CALL_GLYPHS = {
  mic: {
    box: 16,
    strokes: [{ d: 'M6 3.6a2 2 0 014 0v3.6a2 2 0 01-4 0z' }, { d: 'M3.8 7.6a4.2 4.2 0 008.4 0M8 11.8V14' }],
  },
  micOff: {
    box: 16,
    strokes: [
      { d: 'M2.6 2.6l10.8 10.8' },
      { d: 'M6 3.6a2 2 0 014 0v3.6M6 6.4v2.8a2 2 0 003 1.7' },
      { d: 'M3.8 7.6a4.2 4.2 0 006 3.8M12.2 7.6a4.2 4.2 0 01-.3 1.5M8 11.8V14' },
    ],
  },
  camera: { box: 18, strokes: [{ d: CAMERA_BODY }, { d: CAMERA_LENS }] },
  /** Та же камера целиком с диагональю поверх — форма не рассыпается. */
  cameraOff: { box: 18, strokes: [{ d: CAMERA_BODY }, { d: CAMERA_LENS }, { d: 'M2.4 2.4l13.2 13.2' }] },
  screen: { box: 18, strokes: [{ d: rect(1.6, 2.8, 14.8, 10.4, 2) }, { d: 'M6.4 15.8h5.2' }] },
  gear: {
    box: 24,
    strokes: [
      { d: circle(12, 12, 3.1), w: 1.5 },
      {
        d: 'M19.1 14.2a1.6 1.6 0 00.32 1.76l.06.06a1.9 1.9 0 11-2.7 2.7l-.05-.06a1.6 1.6 0 00-1.77-.32 1.6 1.6 0 00-.97 1.47v.16a1.9 1.9 0 11-3.8 0v-.08a1.6 1.6 0 00-1.05-1.47 1.6 1.6 0 00-1.76.32l-.6.06a1.9 1.9 0 11-2.7-2.7l.06-.06a1.6 1.6 0 00.32-1.77 1.6 1.6 0 00-1.47-.97H3.7a1.9 1.9 0 010-3.8h.08a1.6 1.6 0 001.47-1.05 1.6 1.6 0 00-.32-1.76l-.06-.06a1.9 1.9 0 112.7-2.7l.5.06a1.6 1.6 0 001.77.32h.08a1.6 1.6 0 00.97-1.47V3.7a1.9 1.9 0 013.8 0v.08a1.6 1.6 0 00.97 1.47 1.6 1.6 0 001.77-.32l.05-.06a1.9 1.9 0 112.7 2.7l-.6.05a1.6 1.6 0 00-.32 1.77v.08a1.6 1.6 0 001.47.97h.16a1.9 1.9 0 010 3.8h-.08a1.6 1.6 0 00-1.47.97z',
        w: 1.5,
      },
    ],
  },
  /** Трубка сброса — единственная залитая иконка, повёрнута на 133°. */
  hangup: { box: 24, rotate: 133, fills: [HANDSET] },
  answer: { box: 24, fills: [HANDSET] },
  eyeOff: {
    box: 16,
    strokes: [
      { d: 'M2 2l12 12', w: 1.2 },
      {
        d: 'M6.2 4.1A6.9 6.9 0 018 3.9c3.9 0 6.5 4.1 6.5 4.1s-.8 1.3-2.2 2.4M9.7 11.9a6.9 6.9 0 01-1.7.2C4.1 12.1 1.5 8 1.5 8s1-1.6 2.7-2.8',
        w: 1.2,
      },
    ],
  },
  monitor: { box: 16, strokes: [{ d: rect(1.4, 2.6, 13.2, 9.4, 1.6), w: 1.2 }, { d: 'M5.6 14.4h4.8', w: 1.2 }] },
  split: { box: 14, strokes: [{ d: rect(1, 3, 5.2, 8, 1.3), w: 1.1 }, { d: rect(7.8, 3, 5.2, 8, 1.3), w: 1.1 }] },
  chevronDown: { box: 12, strokes: [{ d: 'M2.5 4.5L6 8l3.5-3.5', w: 1.2 }] },
  chevronUp: { box: 12, strokes: [{ d: 'M2.5 7.5L6 4l3.5 3.5', w: 1.2 }] },
  close: { box: 11, strokes: [{ d: 'M1.5 1.5l8 8M9.5 1.5l-8 8', w: 1.2 }] },
  minus: { box: 12, strokes: [{ d: 'M2 6h8', w: 1.2 }] },
  micMutedSmall: {
    box: 16,
    strokes: [
      { d: 'M3 3l10 10', w: 1.2 },
      { d: 'M8 2.4a1.9 1.9 0 011.9 1.9v3.3M6.1 6v2.3a1.9 1.9 0 002.9 1.6', w: 1.2 },
      { d: 'M12 8.4a4 4 0 01-5.6 3.5M4 8.4a4 4 0 00.5 1.9', w: 1.2 },
    ],
  },
} satisfies Record<string, Glyph>;

export type CallGlyphName = keyof typeof CALL_GLYPHS;

/** Нарисованная иконка звонка; цвет — `currentColor`. */
export function CallIcon({
  name,
  size = 19,
  className,
}: {
  name: CallGlyphName;
  size?: number;
  className?: string;
}): React.ReactElement {
  const g: Glyph = CALL_GLYPHS[name];
  const c = g.box / 2;
  return (
    <svg
      className={className ? `vc-icon ${className}` : 'vc-icon'}
      width={size}
      height={size}
      viewBox={`0 0 ${g.box} ${g.box}`}
      fill="none"
      aria-hidden
      focusable="false"
    >
      <g transform={g.rotate ? `rotate(${g.rotate} ${c} ${c})` : undefined}>
        {g.fills?.map((d) => <path key={d} d={d} fill="currentColor" />)}
        {g.strokes?.map((s) => (
          <path
            key={s.d}
            d={s.d}
            stroke="currentColor"
            strokeWidth={s.w ?? 1.25}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </g>
    </svg>
  );
}
