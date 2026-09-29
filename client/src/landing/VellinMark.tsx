import { useId } from 'react';

/**
 * Знак V — тот же контур и тот же свет, что у собранного знака в сплэше и
 * окне входа клиента для Windows (VellinMarkPainter, updater_splash.dart):
 * бумажная лента, тень от сгиба верхней плоскости, светлая кромка и общая
 * объёмная подсветка сверху-слева.
 */
const MARK =
  'M6.8 4L23.5 4Q26 4 27.1 6.5L48.8 55.2Q50 58.8 51.2 55.2L72.9 6.5Q74 4 76.5 4L93.2 4Q96 4 94.75 6.5L50.85 94.3Q50 96.8 49.15 94.3L5.25 6.5Q4 4 6.8 4Z';

/** Верхняя (левая) плоскость ленты — даёт сгиб и его тень. */
const FOLD = 'M75.8 0L-30 0L-30 130L18.1 130Z';

export function VellinMark({ size = 72, title }: { size?: number; title?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        <clipPath id={`${id}-clip`}>
          <path d={MARK} />
        </clipPath>
        <filter id={`${id}-soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.1" />
        </filter>
        <linearGradient id={`${id}-fold`} x1="0" y1="0" x2="70" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id={`${id}-light`} x1="5" y1="0" x2="85" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0.02" />
          <stop offset="1" stopColor="#000" stopOpacity="0.14" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        <path d={MARK} fill="#f7f6f4" />
        <path d={FOLD} fill="#000" fillOpacity="0.21" transform="translate(1.1 1.5)" filter={`url(#${id}-soft)`} />
        <path d={FOLD} fill="#f7f6f4" />
        <path d={FOLD} fill={`url(#${id}-fold)`} />
        <path d={FOLD} fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="0.7" />
        <path d={MARK} fill={`url(#${id}-light)`} />
      </g>
    </svg>
  );
}

/** Знак со словом VELLIN разрядкой — как в окне входа приложения. */
export function VellinLockup({
  size = 72,
  direction = 'column',
}: {
  size?: number;
  direction?: 'column' | 'row';
}) {
  const word = direction === 'column' ? Math.round(size * 0.24) : Math.round(size * 0.58);
  return (
    <span
      style={{
        display: 'inline-flex',
        flexDirection: direction,
        alignItems: 'center',
        gap: direction === 'column' ? Math.round(size * 0.22) : Math.round(size * 0.42),
      }}
    >
      <VellinMark size={size} />
      <span
        style={{
          fontSize: word,
          fontWeight: 500,
          lineHeight: 1,
          letterSpacing: '0.42em',
          // Хвостовая разрядка сдвигает слово влево — компенсируем.
          marginRight: '-0.42em',
          color: '#f7f6f4',
        }}
      >
        VELLIN
      </span>
    </span>
  );
}
