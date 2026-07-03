import { useRef, useState } from 'react';
import { Icon } from '../../../shared';

/**
 * CameraSwitcher — кнопка смены фронт⇄зад во время записи. Отдельная сущность: сама
 * не знает о записи, лишь дёргает `onSwitch`. Жест записи не задевает — тап идёт
 * отдельным pointer'ом (stopPropagation), а window-слушатели кнопки записи игнорят
 * чужой pointerId. На каждое нажатие иконка «переворачивается» на 180° (ease-out,
 * GPU-transform), во время смены кнопка заблокирована.
 */
export function CameraSwitcher({
  onSwitch,
  switching,
}: {
  onSwitch: () => void;
  switching: boolean;
}): React.ReactElement {
  const [turns, setTurns] = useState(0);
  const reduceMotion = useRef(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  ).current;

  const trigger = (): void => {
    if (switching) return;
    setTurns((t) => t + 1);
    onSwitch();
  };

  return (
    <button
      type="button"
      aria-label="Сменить камеру"
      disabled={switching}
      className="dm-press"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={trigger}
      style={{
        pointerEvents: 'auto',
        width: 46,
        height: 46,
        borderRadius: 999,
        border: '1px solid rgba(255,255,255,0.28)',
        background: 'rgba(20,16,14,0.42)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        color: '#fff',
        display: 'grid',
        placeItems: 'center',
        cursor: switching ? 'default' : 'pointer',
        opacity: switching ? 0.7 : 1,
        boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
        transition: 'opacity .18s ease',
      }}
    >
      <span
        style={{
          display: 'grid',
          placeItems: 'center',
          transform: `rotate(${turns * 180}deg)`,
          transition: reduceMotion ? 'none' : 'transform .42s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <Icon name="cameraReverse" size={23} stroke={1.7} />
      </span>
    </button>
  );
}
