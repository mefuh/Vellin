import { useId } from 'react';

// Силуэт V — сложенная лента (точный симметричный знак из бренд-набора).
const V_PATH =
  'M6.8,4 H23.5 Q26,4 27.1,6.5 L48.8,55.2 Q50,58.8 51.2,55.2 L72.9,6.5 Q74,4 76.5,4 H93.2 Q96,4 94.75,6.5 L50.85,94.3 Q50,96.8 49.15,94.3 L5.25,6.5 Q4,4 6.8,4 Z';
// Верхняя (левая) плоскость ленты — её кромка ловит свет и отбрасывает тень.
const FOLD_PATH = 'M75.8,0 H-30 V130 H18.1 Z';

interface VellinMarkProps {
  size?: number;
  /** Игнорируется: знак-иконка имеет фиксированную брендовую заливку.
   *  Оставлен для обратной совместимости сигнатуры. */
  color?: string;
}

/**
 * Знак-иконка Vellin: красная скруглённая плитка со «сложенной лентой» V
 * (бренд-набор, vellin-icon-red.svg). Свет — сверху-слева, тень сгиба —
 * вправо-вниз. Идентификаторы градиентов/фильтров уникальны на каждый инстанс,
 * иначе несколько лого на странице ссылались бы на первый (артефакты рендера).
 */
export function VellinMark({ size = 22 }: VellinMarkProps) {
  const uid = useId().replace(/:/g, '');
  const bg = `vbg-${uid}`;
  const sheen = `vsh-${uid}`;
  const foldGrad = `vfd-${uid}`;
  const blur = `vbl-${uid}`;
  const clip = `vcl-${uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={bg} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#ff6146" />
          <stop offset="0.46" stopColor="#e0342a" />
          <stop offset="1" stopColor="#c02318" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="114" fill={`url(#${bg})`} />
      <g transform="translate(133,133) scale(2.46)">
        <defs>
          <linearGradient id={sheen} x1="0.05" y1="0" x2="0.85" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
            <stop offset="0.45" stopColor="#fff" stopOpacity="0.02" />
            <stop offset="1" stopColor="#000" stopOpacity="0.14" />
          </linearGradient>
          <linearGradient id={foldGrad} x1="0" y1="0" x2="0.7" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.16" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.02" />
          </linearGradient>
          <filter id={blur} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="1.1" />
          </filter>
          <clipPath id={clip}>
            <path d={V_PATH} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clip})`}>
          <path d={V_PATH} fill="#f7f6f4" />
          <path
            d={FOLD_PATH}
            fill="#000"
            opacity="0.21"
            filter={`url(#${blur})`}
            transform="translate(1.1,1.5)"
          />
          <path d={FOLD_PATH} fill="#f7f6f4" />
          <path d={FOLD_PATH} fill={`url(#${foldGrad})`} />
          <path d={FOLD_PATH} fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="0.7" />
          <path d={V_PATH} fill={`url(#${sheen})`} />
        </g>
      </g>
    </svg>
  );
}

interface VellinLogoProps {
  size?: number;
  tone?: string;
  accent?: string;
}
export function VellinLogo({
  size = 22,
  tone = 'var(--text-0)',
}: VellinLogoProps) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <VellinMark size={size} />
      <span
        style={{
          fontSize: size * 0.85,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          color: tone,
        }}
      >
        Vellin
      </span>
    </div>
  );
}
