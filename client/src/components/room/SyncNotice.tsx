import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { C2S } from '@vellin/shared';
import { Icon } from '../../shared';
import { useRoomStore } from '../../stores/roomStore';

/**
 * Информер синхронизации — соскальзывает сверху на своё место при рассинхроне и
 * уезжает обратно вверх, когда больше не нужен. Монтируется внутрь плеера (как
 * ReactionsOverlay) → переживает фуллскрин. Хост/админ видит управление, обычные
 * участники — только факт.
 */
export function SyncNotice({ send }: { send: (msg: C2S) => void }) {
  const status = useRoomStore((s) => s.syncStatus);
  const you = useRoomStore((s) => s.you);
  const active = !!status && (status.desynced || status.waiting);

  // Последний «активный» статус — чтобы текст не схлопывался во время ухода
  // (в сторе статус ещё живёт, но уже «в синке»).
  const lastRef = useRef(status);
  if (active) lastRef.current = status;

  // render — смонтирован ли DOM (держим до конца анимации ухода);
  // shown — целевое состояние перехода (true → на месте, false → уехал вверх).
  const [render, setRender] = useState(active);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (active) {
      setRender(true);
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const id = window.setTimeout(() => setRender(false), 340);
    return () => window.clearTimeout(id);
  }, [active]);

  if (!render) return null;
  const s = lastRef.current;
  if (!s) return null;

  const isHost = you?.role === 'owner' || you?.role === 'admin' || you?.role === 'superadmin';
  const laggard = s.laggards[0];

  let text: string;
  if (s.waiting) {
    text = laggard ? `Ждём ${laggard.username} — буферизация…` : 'Ждём отстающих — буферизация…';
  } else if (s.reason === 'buffering') {
    text = laggard ? `${laggard.username} буферизует — отстаёт` : 'Кто-то буферизует';
  } else {
    const n = Math.abs(s.worstDriftSec).toFixed(1);
    text = laggard ? `${laggard.username} отстаёт на ${n} с` : `Рассинхрон ~${n} с`;
  }

  return (
    <div style={{ ...rootStyle, ...(shown ? shownStyle : hiddenStyle) }}>
      <span style={{ color: s.waiting ? 'var(--accent-hi)' : 'var(--text-2)', display: 'grid', placeItems: 'center' }}>
        <Icon name={s.waiting ? 'refresh' : 'waveform'} size={15} />
      </span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>

      {isHost && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
          <button type="button" style={syncBtn} onClick={() => send({ t: 'sync_all', clientTs: Date.now() })}>
            Синхронизировать всех
          </button>
          <button
            type="button"
            title="Автоматически чинить рассинхрон по мере появления"
            style={{ ...toggleBtn, ...(s.autoSync ? toggleOn : null) }}
            onClick={() => send({ t: 'sync_config', autoSync: !s.autoSync, clientTs: Date.now() })}
          >
            <Icon name="refresh" size={13} /> Авто{s.autoSync ? ': вкл' : ''}
          </button>
        </div>
      )}
    </div>
  );
}

const rootStyle: CSSProperties = {
  position: 'absolute',
  top: 14,
  left: '50%',
  zIndex: 6,
  maxWidth: '94%',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 12px',
  borderRadius: 999,
  background: 'rgba(18,18,20,0.86)',
  backdropFilter: 'blur(6px)',
  border: '1px solid var(--line-2)',
  boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
  color: 'var(--text-0)',
  fontSize: 13,
  fontFamily: 'var(--font-ui)',
  willChange: 'transform, opacity',
  // Мягкое замедление на входе/выходе — «соскальзывание» сверху и обратно.
  transition: 'transform 0.36s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.26s ease',
};

// Спрятан НАД своим местом (на высоту самого информера + запас) и прозрачен.
const hiddenStyle: CSSProperties = {
  transform: 'translate(-50%, calc(-100% - 24px))',
  opacity: 0,
  pointerEvents: 'none',
};

const shownStyle: CSSProperties = {
  transform: 'translate(-50%, 0)',
  opacity: 1,
};

const syncBtn: CSSProperties = {
  border: 'none',
  borderRadius: 999,
  padding: '5px 11px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  background: 'var(--accent)',
  color: '#fff',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
};

const toggleBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  border: '1px solid var(--line-2)',
  borderRadius: 999,
  padding: '5px 10px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  background: 'transparent',
  color: 'var(--text-2)',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
};

const toggleOn: CSSProperties = {
  background: 'rgba(94,194,106,0.16)',
  borderColor: 'var(--ok)',
  color: 'var(--ok)',
};
