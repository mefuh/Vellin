import { useEffect, useRef } from 'react';

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
 * Пружинная (spring physics) анимация произвольного числового значения — та же
 * физика, что у {@link import('./useSpringWidth').useSpringWidth} (пузырь шапки
 * чата), но без привязки к `width`: значение отдаётся через колбэк `apply` на
 * каждый кадр, чтобы вызывающий сам решал, что с ним делать (`opacity`,
 * `transform: scale(...)` и т.п.). Как и у ширины — при смене `target`
 * посередине движения пружина плавно перенацеливается, сохраняя текущие
 * позицию и скорость, а не перезапускается с нуля.
 */
export function useSpringValue(
  target: number,
  apply: (value: number) => void,
  { stiffness = 300, damping = 26, mass = 1 }: SpringOpts = {},
): void {
  const stateRef = useRef({ pos: target, vel: 0, raf: 0, ready: false });
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => {
    const s = stateRef.current;

    if (!s.ready) {
      s.ready = true;
      s.pos = target;
      applyRef.current(target);
      return;
    }
    if (Math.abs(s.pos - target) < 0.002 && Math.abs(s.vel) < 0.02) return;

    if (s.raf) cancelAnimationFrame(s.raf);

    if (prefersReducedMotion()) {
      s.pos = target;
      s.vel = 0;
      applyRef.current(target);
      return;
    }

    let last = performance.now();
    const step = (t: number): void => {
      const dt = Math.min(0.032, (t - last) / 1000);
      last = t;
      const force = -stiffness * (s.pos - target) - damping * s.vel;
      s.vel += (force / mass) * dt;
      s.pos += s.vel * dt;
      const settled = Math.abs(s.pos - target) < 0.002 && Math.abs(s.vel) < 0.02;
      if (settled) {
        s.pos = target;
        s.vel = 0;
        applyRef.current(target);
        s.raf = 0;
        return;
      }
      applyRef.current(s.pos);
      s.raf = requestAnimationFrame(step);
    };
    s.raf = requestAnimationFrame(step);
    return () => {
      if (s.raf) cancelAnimationFrame(s.raf);
    };
  }, [target, stiffness, damping, mass]);
}
