import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

type Phase = 'enter' | 'idle' | 'leave';
interface Layer {
  id: string;
  node: ReactNode;
  phase: Phase;
}

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Мягкая смена одной строки статуса (fade + лёгкий вертикальный сдвиг) БЕЗ
 * размонтирования родителя и без мигания. `id` — стабильный идентификатор
 * ВИДА статуса («online», «typing-voice», «offline» и т.п.), а не самого
 * текста: смена id запускает переход; тот же id с новым содержимым (например
 * «был 5 минут назад» → «был 6 минут назад», тикающее раз в минуту) просто
 * обновляет текст на месте, без анимации — так решение не привязано к
 * конкретному набору строк и одинаково работает для любых будущих статусов.
 */
export function AnimatedStatusText({ id, children }: { id: string; children: ReactNode }): React.ReactElement {
  const [layers, setLayers] = useState<Layer[]>([{ id, node: children, phase: 'idle' }]);

  useEffect(() => {
    setLayers((prev) => {
      const active = prev.find((l) => l.phase !== 'leave');
      if (active?.id === id) {
        return prev.map((l) => (l.id === id ? { ...l, node: children } : l));
      }
      return [...prev.map((l) => ({ ...l, phase: 'leave' as const })), { id, node: children, phase: 'enter' as const }];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, children]);

  // Входящий слой: следующий кадр переводим enter → idle, чтобы браузер успел
  // отрисовать стартовый кадр до начала transition (иначе перехода не видно).
  useEffect(() => {
    if (!layers.some((l) => l.phase === 'enter')) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setLayers((prev) => prev.map((l) => (l.phase === 'enter' ? { ...l, phase: 'idle' } : l)));
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [layers]);

  // Уходящие слои снимаем после завершения их transition.
  useEffect(() => {
    if (!layers.some((l) => l.phase === 'leave')) return;
    const ms = prefersReducedMotion() ? 0 : 220;
    const t = window.setTimeout(() => setLayers((prev) => prev.filter((l) => l.phase !== 'leave')), ms);
    return () => window.clearTimeout(t);
  }, [layers]);

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      {layers.map((l) => (
        <span key={l.id} style={layerStyle(l.phase)}>
          {l.node}
        </span>
      ))}
    </span>
  );
}

function layerStyle(phase: Phase): CSSProperties {
  const reduceMotion = prefersReducedMotion();
  const leaving = phase === 'leave';
  const entering = phase === 'enter';
  return {
    // Уходящий слой — вне потока (не влияет на размер обёртки, его уже задаёт
    // входящий/устоявшийся слой); входящий/устоявшийся — в потоке.
    position: leaving ? 'absolute' : 'relative',
    inset: leaving ? 0 : undefined,
    display: 'inline-flex',
    alignItems: 'center',
    whiteSpace: 'nowrap',
    opacity: entering || leaving ? 0 : 1,
    transform: reduceMotion ? undefined : entering ? 'translateY(4px)' : leaving ? 'translateY(-4px)' : 'translateY(0)',
    transition: reduceMotion
      ? 'opacity .15s ease'
      : 'opacity .18s ease, transform .22s cubic-bezier(0.22, 1, 0.36, 1)',
    pointerEvents: leaving ? 'none' : undefined,
  };
}
