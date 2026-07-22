interface MountainPosterProps {
  width?: number | string;
  height?: number | string;
  seed?: number;
  label?: string;
  time?: string;
}

const PALETTES: ReadonlyArray<readonly [string, string, string, string]> = [
  ['#3a2418', '#6b3a24', '#c4632a', '#e89456'],
  ['#0c1620', '#1a3450', '#3a6b8a', '#a8c5d8'],
  ['#1a1410', '#3a2820', '#7a4a30', '#d18a5a'],
  ['#0a1a18', '#1c3a36', '#4a8076', '#a0c0b8'],
  ['#1a0a14', '#4a1a2e', '#8a3a52', '#d47280'],
  ['#181820', '#2a2a3a', '#5a5a7a', '#a0a0c0'],
];

export function MountainPoster({
  width = '100%',
  height = '100%',
  seed = 0,
  label,
  time,
}: MountainPosterProps) {
  const p = PALETTES[seed % PALETTES.length]!;
  const id = `mp${seed}`;
  return (
    <svg
      viewBox="0 0 400 240"
      width={width}
      height={height}
      preserveAspectRatio="xMidYMid slice"
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id={`${id}sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p[0]} />
          <stop offset="0.55" stopColor={p[1]} />
          <stop offset="1" stopColor={p[2]} />
        </linearGradient>
        <radialGradient id={`${id}sun`} cx="0.72" cy="0.42" r="0.18">
          <stop offset="0" stopColor={p[3]} stopOpacity="0.9" />
          <stop offset="1" stopColor={p[3]} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}haze`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p[1]} stopOpacity="0" />
          <stop offset="1" stopColor={p[0]} stopOpacity="0.6" />
        </linearGradient>
      </defs>
      <rect width="400" height="240" fill={`url(#${id}sky)`} />
      <rect width="400" height="240" fill={`url(#${id}sun)`} />
      <circle cx="288" cy="100" r="18" fill={p[3]} opacity="0.85" />
      <path
        d="M0 150 L40 130 L80 145 L130 115 L180 140 L230 110 L280 135 L330 120 L400 140 L400 240 L0 240Z"
        fill={p[1]}
        opacity="0.85"
      />
      <path
        d="M0 170 L60 150 L110 165 L160 135 L220 165 L270 145 L340 170 L400 155 L400 240 L0 240Z"
        fill={p[0]}
        opacity="0.95"
      />
      <rect width="400" height="240" fill={`url(#${id}haze)`} />
      <path
        d="M0 200 L40 185 L90 195 L150 175 L210 190 L270 180 L340 195 L400 185 L400 240 L0 240Z"
        fill="#000"
        opacity="0.7"
      />
      <path
        d="M0 220 L100 210 L200 218 L300 208 L400 220 L400 240 L0 240Z"
        fill="#000"
        opacity="0.85"
      />
      {label && (
        <text
          x="20"
          y="222"
          fill="#fff"
          opacity="0.85"
          fontSize="11"
          fontFamily="ui-monospace, monospace"
          letterSpacing="0.05em"
        >
          {label}
        </text>
      )}
      {time && (
        <text
          x="380"
          y="222"
          fill="#fff"
          opacity="0.65"
          fontSize="11"
          fontFamily="ui-monospace, monospace"
          textAnchor="end"
        >
          {time}
        </text>
      )}
    </svg>
  );
}
