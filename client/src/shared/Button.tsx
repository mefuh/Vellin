import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'glass' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  children?: ReactNode;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
  full?: boolean;
  style?: CSSProperties;
}

const SIZES: Record<Size, { h: number; px: number; fs: number; gap: number; iconSize: number }> = {
  sm: { h: 30, px: 12, fs: 13, gap: 6, iconSize: 14 },
  md: { h: 38, px: 16, fs: 14, gap: 8, iconSize: 16 },
  lg: { h: 46, px: 20, fs: 15, gap: 10, iconSize: 18 },
};

const VARIANTS: Record<Variant, CSSProperties> = {
  primary: {
    background: 'var(--accent)',
    color: '#fff',
    boxShadow: '0 1px 0 rgba(255,255,255,0.15) inset, 0 6px 20px var(--accent-glow)',
  },
  secondary: {
    background: 'var(--bg-3)',
    color: 'var(--text-0)',
    boxShadow: 'inset 0 0 0 1px var(--line-2)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-1)',
  },
  glass: {
    background: 'var(--glass-bg)',
    color: 'var(--text-0)',
    backdropFilter: 'blur(var(--glass-blur))',
    boxShadow: 'inset 0 0 0 1px var(--glass-bd)',
  },
  danger: {
    background: 'rgba(209, 39, 27, 0.12)',
    color: 'var(--accent-hi)',
    boxShadow: 'inset 0 0 0 1px rgba(209, 39, 27, 0.3)',
  },
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  full,
  style,
  ...rest
}: ButtonProps) {
  const s = SIZES[size];
  return (
    <button
      {...rest}
      style={{
        height: s.h,
        padding: `0 ${s.px}px`,
        fontSize: s.fs,
        gap: s.gap,
        borderRadius: 'var(--r-md)',
        border: 'none',
        fontFamily: 'inherit',
        fontWeight: 500,
        letterSpacing: '-0.01em',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: rest.disabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
        width: full ? '100%' : 'auto',
        transition: 'transform .12s, filter .12s, opacity .12s',
        opacity: rest.disabled ? 0.55 : 1,
        ...VARIANTS[variant],
        ...style,
      }}
    >
      {icon && <Icon name={icon} size={s.iconSize} />}
      {children}
      {iconRight && <Icon name={iconRight} size={s.iconSize} />}
    </button>
  );
}
