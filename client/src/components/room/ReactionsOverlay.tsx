import { useMemo } from 'react';
import type { ReactionEvent } from '@vellin/shared';

interface ReactionsOverlayProps {
  reactions: ReactionEvent[];
}

export function ReactionsOverlay({ reactions }: ReactionsOverlayProps) {
  const items = useMemo(
    () =>
      reactions.map((r) => ({
        ...r,
        x: 20 + ((r.createdAt >> 4) % 60),
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
