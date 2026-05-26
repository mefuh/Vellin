import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { CallMember, ParticipantInfo } from '@vellin/shared';
import { useRoomStore } from '../../stores/roomStore';
import { useCallContext } from '../../hooks/CallContext';
import { useCallSettingsStore, type CircleSize } from '../../stores/callSettingsStore';
import { Avatar } from '../../shared';
import { CallTile } from './CallTile';

// Pixel sizes for the three discrete options the user can pick in the call
// settings modal. Audio-only bubble shrinks proportionally so the overlap
// row still fits along the right edge of the player.
const CIRCLE_PX: Record<CircleSize, number> = { small: 78, standard: 108, large: 144 };
const BUBBLE_PX: Record<CircleSize, number> = { small: 30, standard: 38, large: 48 };
const BUBBLE_AVATAR_PX: Record<CircleSize, number> = { small: 24, standard: 32, large: 40 };
const BUBBLE_OVERLAP_PX: Record<CircleSize, number> = { small: -8, standard: -10, large: -14 };

const STACK_MARGIN = 12;
const STACK_GAP = 14;
// Extra vertical space the circle wrapper takes for the name label sibling
// underneath the round media. Used when clamping drag bounds to the player.
const NAME_LABEL_RESERVE_PX = 22;

interface FullscreenCallOverlayProps {
  /** Mirrors VideoPlayer's `controlsVisible` so the labels fade with the chrome. */
  expanded: boolean;
}

/**
 * Telegram-style circular webcam tiles overlaid on the player. Default
 * layout is a top-right vertical stack; the user can drag any tile to a
 * custom position, which persists per-userId via `callSettingsStore`.
 * Audio playback itself lives in `<RemoteAudioMixer>` at the Room.tsx level
 * so it survives every overlay mount/unmount.
 */
export function FullscreenCallOverlay({ expanded }: FullscreenCallOverlayProps) {
  const callMembers = useRoomStore((s) => s.call.members);
  const participants = useRoomStore((s) => s.participants);
  const you = useRoomStore((s) => s.you);
  const circleSize = useCallSettingsStore((s) => s.circleSize);
  const tilePositions = useCallSettingsStore((s) => s.tilePositions);
  const setTilePosition = useCallSettingsStore((s) => s.setTilePosition);
  const { myStream, remoteStreams, speaking } = useCallContext();

  const tilePx = CIRCLE_PX[circleSize];
  const bubblePx = BUBBLE_PX[circleSize];
  const bubbleAvatarPx = BUBBLE_AVATAR_PX[circleSize];
  const bubbleOverlapPx = BUBBLE_OVERLAP_PX[circleSize];

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  // Track player size so the default top-right stack stays anchored to the
  // right edge and so we can convert dragged fractional positions back to px.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = (): void => {
      const r = el.getBoundingClientRect();
      setContainerSize({ w: r.width, h: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const participantsById = useMemo(() => {
    const m = new Map<string, ParticipantInfo>();
    for (const p of participants) m.set(p.userId, p);
    return m;
  }, [participants]);

  const myUserId = you?.userId ?? null;

  if (callMembers.length === 0) return null;

  const withVideo: CallMember[] = [];
  const audioOnly: CallMember[] = [];
  for (const m of callMembers) (m.video ? withVideo : audioOnly).push(m);

  // Stacked = tiles without a saved position. They get auto-arranged in the
  // top-right column; floating = user-dragged ones use their saved coords.
  // Compacting (stack-index skipping floaters) keeps the visible stack tight
  // when the user pulls some tiles out.
  const stackedVideoMembers = withVideo.filter((m) => !tilePositions[m.userId]);
  const stackHeightPx =
    stackedVideoMembers.length === 0
      ? 0
      : stackedVideoMembers.length * tilePx
        + (stackedVideoMembers.length - 1) * STACK_GAP
        + NAME_LABEL_RESERVE_PX * stackedVideoMembers.length;

  const defaultPosFor = (stackIndex: number): { x: number; y: number } => ({
    x: Math.max(0, containerSize.w - STACK_MARGIN - tilePx),
    y: STACK_MARGIN + stackIndex * (tilePx + STACK_GAP + NAME_LABEL_RESERVE_PX),
  });

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 3,
        opacity: expanded ? 1 : 0.85,
        transition: 'opacity 180ms ease',
        // Container itself is transparent to events — only the draggable
        // tiles re-enable pointer events on themselves, so clicks on the
        // bare video surface still reach the player.
        pointerEvents: 'none',
      }}
    >
      {withVideo.map((m) => {
        const isMe = m.userId === myUserId;
        const p = participantsById.get(m.userId) ?? null;
        const saved = tilePositions[m.userId];
        // Stack index is computed against the *visible stack only* (skipping
        // dragged-out tiles) so the remaining stack auto-compacts.
        const stackIndex = stackedVideoMembers.indexOf(m);
        const posPx = saved
          ? { x: saved.fx * containerSize.w, y: saved.fy * containerSize.h }
          : defaultPosFor(stackIndex);

        return (
          <DraggableCircle
            key={m.userId}
            posPx={posPx}
            tilePx={tilePx}
            containerSize={containerSize}
            onDragEnd={(p) => {
              if (containerSize.w === 0 || containerSize.h === 0) return;
              setTilePosition(m.userId, {
                fx: p.x / containerSize.w,
                fy: p.y / containerSize.h,
              });
            }}
          >
            <CallTile
              userId={m.userId}
              username={p?.username ?? m.userId.slice(0, 6)}
              avatarSeed={p?.avatarSeed ?? m.userId}
              member={m}
              stream={isMe ? myStream : remoteStreams.get(m.userId) ?? null}
              speaking={speaking.has(m.userId)}
              shape="circle"
              size={tilePx}
              isMe={isMe}
            />
          </DraggableCircle>
        );
      })}

      {audioOnly.length > 0 && (
        // Audio-only row is parked top-right, just below the visible stack.
        // It doesn't drag — it's a "who's also in the call" status strip.
        <div
          style={{
            position: 'absolute',
            top: STACK_MARGIN + stackHeightPx + (stackHeightPx > 0 ? STACK_GAP : 0),
            right: STACK_MARGIN,
            display: 'flex',
            gap: 0,
            paddingLeft: 8,
            pointerEvents: 'none',
          }}
        >
          {audioOnly.map((m, i) => {
            const p = participantsById.get(m.userId) ?? null;
            const isSpeaking = speaking.has(m.userId);
            return (
              <div
                key={m.userId}
                title={p?.username}
                style={{
                  marginLeft: i === 0 ? 0 : bubbleOverlapPx,
                  width: bubblePx,
                  height: bubblePx,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  background: 'var(--bg-3)',
                  border: '2px solid rgba(20,16,14,0.62)',
                  boxShadow:
                    isSpeaking && m.audio
                      ? '0 0 0 2px var(--accent-hi), 0 0 12px rgba(232,70,42,0.4)'
                      : 'none',
                  transition: 'box-shadow .14s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Avatar
                  name={p?.username ?? m.userId}
                  seed={p?.avatarSeed ?? m.userId}
                  size={bubbleAvatarPx}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Absolute-positioned wrapper around a `<CallTile shape="circle">`. Listens
 * to pointer events for drag, clamps to the container's bounds, and notifies
 * the parent on drag end so the position is persisted as a fraction of the
 * container size.
 */
function DraggableCircle({
  posPx,
  tilePx,
  containerSize,
  onDragEnd,
  children,
}: {
  posPx: { x: number; y: number };
  tilePx: number;
  containerSize: { w: number; h: number };
  onDragEnd: (p: { x: number; y: number }) => void;
  children: ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  const [localPos, setLocalPos] = useState(posPx);
  const startRef = useRef({ pointerX: 0, pointerY: 0, posX: 0, posY: 0 });
  const movedRef = useRef(false);

  // When the parent recomputes the default position (stack size change,
  // container resize) — accept the new value unless the user is mid-drag.
  useEffect(() => {
    if (!dragging) setLocalPos(posPx);
  }, [posPx.x, posPx.y, dragging]);

  const clamp = (px: number, py: number): { x: number; y: number } => {
    // Allow the bottom edge to reserve room for the name label.
    const maxX = Math.max(0, containerSize.w - tilePx);
    const maxY = Math.max(0, containerSize.h - tilePx - NAME_LABEL_RESERVE_PX);
    return {
      x: Math.min(Math.max(0, px), maxX),
      y: Math.min(Math.max(0, py), maxY),
    };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    // Ignore drags initiated on interactive children (e.g. PeerVolumeControl
    // button) — they handle their own clicks; for circles they're not
    // rendered today, but this future-proofs the wrapper.
    const target = e.target as HTMLElement;
    if (target.closest('button, input, select, a, [role="dialog"]')) return;
    e.preventDefault();
    startRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      posX: localPos.x,
      posY: localPos.y,
    };
    movedRef.current = false;
    setDragging(true);
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      /* ignore — some platforms reject capture for pen/touch */
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!dragging) return;
    const dx = e.clientX - startRef.current.pointerX;
    const dy = e.clientY - startRef.current.pointerY;
    if (!movedRef.current && Math.hypot(dx, dy) > 2) movedRef.current = true;
    setLocalPos(clamp(startRef.current.posX + dx, startRef.current.posY + dy));
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!dragging) return;
    setDragging(false);
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (movedRef.current) onDragEnd(localPos);
  };

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: 'absolute',
        left: localPos.x,
        top: localPos.y,
        cursor: dragging ? 'grabbing' : 'grab',
        pointerEvents: 'auto',
        userSelect: 'none',
        touchAction: 'none',
        transition: dragging ? 'none' : 'left 180ms ease, top 180ms ease',
        // Keep the dragged tile above its siblings for clean overlap when
        // the user parks two close together.
        zIndex: dragging ? 4 : 3,
        filter: dragging ? 'drop-shadow(0 8px 20px rgba(0,0,0,0.5))' : undefined,
      }}
    >
      {children}
    </div>
  );
}
