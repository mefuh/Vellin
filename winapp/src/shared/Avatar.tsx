import type { CSSProperties } from 'react';

const AVATAR_COLORS: ReadonlyArray<readonly [string, string]> = [
  ['#d1271b', '#7a1610'],
  ['#c4632a', '#7a3812'],
  ['#a0612a', '#5e3814'],
  ['#9c5c8a', '#5a2d52'],
  ['#3a6b8a', '#1d3a4e'],
  ['#5a7a3e', '#2e421f'],
  ['#7a5a3e', '#4a3520'],
  ['#8a4a4a', '#4e2828'],
];

export type AvatarStatus = 'online' | 'watching' | 'idle' | 'offline';
export type AvatarRing = 'accent' | 'ok';

interface AvatarProps {
  name: string;
  /** Optional deterministic seed to override hash (eg. avatarSeed from user). */
  seed?: string;
  /** Загруженная картинка аватара. Если задана — рисуем её вместо градиента. */
  src?: string | null;
  size?: number;
  status?: AvatarStatus;
  ring?: AvatarRing;
  style?: CSSProperties;
}

function colorPair(value: string): readonly [string, string] {
  const hash = [...value].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[hash]!;
}

export function Avatar({ name, seed, src, size = 32, status, ring, style }: AvatarProps) {
  const initials = (name || '?')
    .split(/\s+/)
    .map((s) => s[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const [c1, c2] = colorPair(seed ?? name ?? '?');

  const ringShadow = ring
    ? `0 0 0 2px var(--bg-1), 0 0 0 ${2 + (ring === 'accent' ? 2 : 1)}px ${
        ring === 'accent' ? 'var(--accent)' : 'var(--ok)'
      }`
    : 'inset 0 1px 0 rgba(255,255,255,0.15)';

  // Размер точки растёт с аватаром, но с потолком (иначе на крупном — огромная).
  const dotSize = Math.min(Math.max(8, size * 0.28), 16);
  // Центрируем точку на окружности под ~45° (снизу-справа), а не в углу
  // bounding-box — иначе на круглом аватаре она «выезжает» за край.
  const dotInset = size * 0.1464 - dotSize / 2;

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0, ...style }}>
      {src ? (
        <img
          src={src}
          alt={name}
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            objectFit: 'cover',
            display: 'block',
            boxShadow: ringShadow,
          }}
        />
      ) : (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${c1}, ${c2})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 600,
            fontSize: size * 0.38,
            letterSpacing: '-0.02em',
            boxShadow: ringShadow,
          }}
        >
          {initials}
        </div>
      )}
      {status && (
        <span
          style={{
            position: 'absolute',
            right: dotInset,
            bottom: dotInset,
            width: dotSize,
            height: dotSize,
            borderRadius: '50%',
            background:
              status === 'online'
                ? '#3fb950'
                : status === 'watching'
                  ? 'var(--accent)'
                  : status === 'idle'
                    ? '#facc15'
                    : '#5a504a',
            boxShadow: '0 0 0 2px var(--bg-1)',
          }}
        />
      )}
    </div>
  );
}
