import { useRef, type ReactNode } from 'react';
import { Icon } from '../../shared';
import { useVoicePlayerStore } from '../../stores/voicePlayerStore';

/** mm:ss из секунд. */
function fmtDur(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

interface Palette {
  btnBg: string;
  btnIcon: string;
  waveActive: string;
  waveIdle: string;
  timeColor: string;
  pillBg: string;
  pillColor: string;
}

const MINE: Palette = {
  btnBg: 'rgba(255,255,255,0.22)',
  btnIcon: '#fff',
  waveActive: '#fff',
  waveIdle: 'rgba(255,255,255,0.42)',
  timeColor: 'rgba(255,255,255,0.82)',
  pillBg: 'rgba(255,255,255,0.2)',
  pillColor: '#fff',
};
// Входящее голосовое монохромное (как в макете) — без акцента, читаемо в любой теме.
const THEIRS: Palette = {
  btnBg: 'var(--bg-5)',
  btnIcon: 'var(--text-0)',
  waveActive: 'var(--text-0)',
  waveIdle: 'var(--line-3, #9aa3b2)',
  timeColor: 'var(--text-3)',
  pillBg: 'var(--bg-2)',
  pillColor: 'var(--text-1)',
};

/**
 * Премиальный плеер голосового: круглая play/pause, амплитудная волна с
 * заливкой по прогрессу (тап/перетаскивание = перемотка), переключатель
 * скорости и индикатор «прослушано». Один общий аудио-пайплайн —
 * {@link useVoicePlayerStore} — гарантирует, что играет только одно голосовое и
 * после него стартует следующее непрослушанное.
 */
export function VoicePlayer({
  messageId,
  url,
  durationSec,
  peaks,
  mine,
  played,
  pending,
  clock,
  statusSlot,
}: {
  messageId: string;
  url: string;
  durationSec: number;
  peaks: number[];
  mine: boolean;
  played: boolean;
  pending?: boolean;
  clock: string;
  statusSlot?: ReactNode;
}) {
  const pal = mine ? MINE : THEIRS;
  const waveRef = useRef<HTMLDivElement>(null);

  const isCurrent = useVoicePlayerStore((s) => s.currentId === messageId);
  const playing = useVoicePlayerStore((s) => s.playing && s.currentId === messageId);
  const posSec = useVoicePlayerStore((s) => (s.currentId === messageId ? s.positionSec : 0));
  const liveDur = useVoicePlayerStore((s) => (s.currentId === messageId ? s.durationSec : 0));
  const toggle = useVoicePlayerStore((s) => s.toggle);
  const seek = useVoicePlayerStore((s) => s.seek);

  const dur = liveDur > 0 ? liveDur : durationSec;
  const frac = isCurrent && dur > 0 ? Math.min(1, posSec / dur) : 0;
  const bars = peaks.length > 0 ? peaks : Array.from({ length: 32 }, () => 30);
  // Сколько столбиков уже «пройдено» прогрессом (для дискретной заливки).
  const filledTo = Math.round(frac * bars.length);

  const seekFromEvent = (clientX: number): void => {
    const el = waveRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    seek(messageId, url, durationSec, (clientX - rect.left) / rect.width);
  };

  // Показываем «прослушано» только автору (mine) — что собеседник дослушал.
  // Для входящего непрослушанного — точка-индикатор (как непрочитанное).
  const incomingUnplayed = !mine && !played;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 'min(248px, 58vw)', opacity: pending ? 0.7 : 1 }}>
      <button
        onClick={() => !pending && toggle(messageId, url, durationSec)}
        onMouseDown={(e) => e.preventDefault()}
        aria-label={playing ? 'Пауза' : 'Воспроизвести'}
        disabled={pending}
        style={{
          flexShrink: 0,
          width: 42,
          height: 42,
          borderRadius: 999,
          border: 'none',
          background: pal.btnBg,
          color: pal.btnIcon,
          display: 'grid',
          placeItems: 'center',
          cursor: pending ? 'default' : 'pointer',
          // Лёгкое свечение у играющего голосового (как в макете).
          boxShadow: playing ? `0 0 0 4px ${mine ? 'rgba(255,255,255,0.16)' : 'var(--accent-soft)'}` : 'none',
          transition: 'box-shadow .2s ease',
        }}
      >
        <Icon name={playing ? 'pause' : 'play'} size={16} />
      </button>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {/* Волна */}
        <div
          ref={waveRef}
          onPointerDown={(e) => {
            if (pending) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            seekFromEvent(e.clientX);
          }}
          onPointerMove={(e) => {
            if (pending || e.buttons === 0) return;
            if (e.currentTarget.hasPointerCapture(e.pointerId)) seekFromEvent(e.clientX);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            height: 26,
            cursor: pending ? 'default' : 'pointer',
            touchAction: 'none',
          }}
        >
          {bars.map((p, i) => (
            <span
              key={i}
              style={{
                flex: '1 1 0',
                minWidth: 0,
                height: `${Math.max(10, Math.min(100, p))}%`,
                minHeight: 3,
                borderRadius: 2,
                background: i < filledTo ? pal.waveActive : pal.waveIdle,
                transition: 'background .12s linear',
              }}
            />
          ))}
        </div>

        {/* Время + скорость + индикаторы */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: pal.timeColor }}>
          <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 11.5, fontWeight: 600 }}>
            {fmtDur(isCurrent && (playing || posSec > 0) ? posSec : dur)}
          </span>
          {incomingUnplayed && (
            <span
              aria-label="Не прослушано"
              style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--accent)', flexShrink: 0 }}
            />
          )}
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {clock}
            {statusSlot}
          </span>
        </div>
      </div>
    </div>
  );
}
