interface VellinMarkProps {
  size?: number;
  color?: string;
}
export function VellinMark({ size = 22, color = 'var(--accent)' }: VellinMarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill={color} />
      <path d="M9 10l5 12h4l5-12h-3.5l-3.5 9-3.5-9H9z" fill="#fff" />
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
  accent = 'var(--accent)',
}: VellinLogoProps) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <VellinMark size={size} color={accent} />
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
