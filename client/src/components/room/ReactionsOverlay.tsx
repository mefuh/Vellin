import { useMemo } from 'react';
import { useRoomStore } from '../../stores/roomStore';

/**
 * Стабильный беззнаковый хеш строки → горизонтальная позиция реакции.
 * Раньше позиция считалась как `20 + ((createdAt >> 4) % 60)`, но `>>` приводит
 * ms-таймстамп (~1.78e12) к 32-битному ЗНАКОВОМУ int — примерно половину
 * каждого ~49-дневного цикла он отрицательный, тогда `% 60` тоже отрицателен и
 * реакции «уезжают» влево/за экран. Хеш id всегда положительный и стабилен.
 */
function spreadX(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) >>> 0;
  return 12 + (h % 72); // 12..83% ширины
}

/**
 * Flying-emoji layer. Rendered *inside* the player element so it survives the
 * Fullscreen API — an overlay placed outside the fullscreen element would be
 * hidden behind the top-layer and reactions would never show in fullscreen.
 * Reads reactions straight from the store so it needs no prop threading.
 */
export function ReactionsOverlay() {
  const reactions = useRoomStore((s) => s.reactions);
  const items = useMemo(
    () =>
      reactions.map((r) => ({
        ...r,
        x: spreadX(r.id),
      })),
    [reactions],
  );

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 5,
      }}
    >
      {items.map((r) => (
        <div
          key={r.id}
          style={{
            position: 'absolute',
            left: `${r.x}%`,
            bottom: 16,
            fontSize: 32,
            animation: 'reactionFly 4s ease-out forwards',
            filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.45))',
            textShadow: '0 0 8px rgba(0,0,0,0.4)',
          }}
        >
          {r.emoji}
          <span
            style={{
              display: 'block',
              fontSize: 11,
              color: '#fff',
              textAlign: 'center',
              marginTop: 2,
              fontFamily: 'var(--font-ui)',
            }}
          >
            {r.username}
          </span>
        </div>
      ))}
      <style>{`@keyframes reactionFly { from { transform: translateY(0); opacity: 1; } to { transform: translateY(-280px); opacity: 0; } }`}</style>
    </div>
  );
}
