import { useEffect, useRef, type RefObject } from 'react';

interface SpringOpts {
  /** Жёсткость пружины — выше = быстрее «долетает» до цели. */
  stiffness?: number;
  /** Демпфирование — ниже = заметнее пружинит/перелетает цель перед остановкой. */
  damping?: number;
  mass?: number;
}

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Пружинная (spring physics) анимация числового CSS-размера в px — БЕЗ единого
 * React-ре-рендера: значение накатывается прямо в DOM через ref на каждый
 * кадр (semi-implicit Euler интегрирование пружины stiffness/damping/mass).
 *
 * Ключевое отличие от CSS transition/keyframes: при смене `target` ПОСЕРЕДИНЕ
 * движения пружина плавно перенацеливается, сохраняя текущие позицию и
 * скорость — а не перезапускается с нуля. Это и даёт «живое» ощущение при
 * частой смене статусов (гс → печатает → онлайн...), а не рывок на каждое
 * новое значение.
 */
export function useSpringWidth<T extends HTMLElement>(
  ref: RefObject<T | null>,
  target: number,
  { stiffness = 300, damping = 26, mass = 1 }: SpringOpts = {},
): void {
  const stateRef = useRef({ pos: target, vel: 0, raf: 0, ready: false });

  useEffect(() => {
    const el = ref.current;
    if (!el || target <= 0) return;
    const s = stateRef.current;

    if (!s.ready) {
      // Первое применение — сразу финальный размер, без анимации «из нуля».
      s.ready = true;
      s.pos = target;
      el.style.width = `${target}px`;
      return;
    }
    if (Math.abs(s.pos - target) < 0.5 && Math.abs(s.vel) < 0.5) return;

    if (s.raf) cancelAnimationFrame(s.raf);

    if (prefersReducedMotion()) {
      s.pos = target;
      s.vel = 0;
      el.style.width = `${target}px`;
      return;
    }

    let last = performance.now();
    const step = (t: number): void => {
      // Клип dt: если вкладка была в фоне (throttled rAF) или кадр «залип»,
      // не даём пружине получить нефизичный рывок за один большой скачок.
      const dt = Math.min(0.032, (t - last) / 1000);
      last = t;
      const force = -stiffness * (s.pos - target) - damping * s.vel;
      s.vel += (force / mass) * dt;
      s.pos += s.vel * dt;
      const settled = Math.abs(s.pos - target) < 0.4 && Math.abs(s.vel) < 4;
      if (settled) {
        s.pos = target;
        s.vel = 0;
        el.style.width = `${target}px`;
        s.raf = 0;
        return;
      }
      el.style.width = `${s.pos}px`;
      s.raf = requestAnimationFrame(step);
    };
    s.raf = requestAnimationFrame(step);
    return () => {
      if (s.raf) cancelAnimationFrame(s.raf);
    };
  }, [target, ref, stiffness, damping, mass]);
}
