import type { CSSProperties, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

type Tone = 'neutral' | 'accent' | 'success' | 'live';

interface ChipProps {
  children: ReactNode;
  tone?: Tone;
  icon?: IconName;
  /** Suppress the automatic leading dot on the 'live' tone (e.g. to place it
   *  manually elsewhere in the content). */
  hideDot?: boolean;
  style?: CSSProperties;
}

const TONES: Record<Tone, { bg: string; fg: string; bd: string }> = {
  neutral: { bg: 'var(--bg-3)', fg: 'var(--text-1)', bd: 'var(--line-2)' },
  accent: { bg: 'var(--accent-soft)', fg: 'var(--accent-hi)', bd: 'rgba(209,39,27,0.2)' },
  success: { bg: 'rgba(74,222,128,0.1)', fg: 'var(--ok)', bd: 'rgba(74,222,128,0.2)' },
  live: { bg: 'rgba(209,39,27,0.18)', fg: '#fff', bd: 'rgba(209,39,27,0.3)' },
};

export function Chip({ children, tone = 'neutral', icon, hideDot, style }: ChipProps) {
  const t = TONES[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: '0.01em',
        maxWidth: '100%',
        minWidth: 0,
        background: t.bg,
        color: t.fg,
        boxShadow: `inset 0 0 0 1px ${t.bd}`,
        ...style,
      }}
    >
      {tone === 'live' && !hideDot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 0 6px #fff',
          }}
        />
      )}
      {icon && <Icon name={icon} size={11} />}
      {children}
    </span>
  );
}
