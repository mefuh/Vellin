import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * Натуральная (нестеснённая) ширина элемента в px, живо отслеживается через
 * ResizeObserver. Используется как источник «желаемого» размера для пружинных
 * анимаций (см. {@link import('./useSpringWidth').useSpringWidth}) — сам
 * измеряемый элемент не должен быть визуально усечён своим родителем, иначе
 * измерение будет отражать урезанный, а не настоящий целевой размер.
 */
export function useElementWidth<T extends HTMLElement>(ref: RefObject<T | null>): number {
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof ResizeObserver === 'undefined') {
      setWidth(el.getBoundingClientRect().width);
      return;
    }
    const ro = new ResizeObserver((entries) => {
      // getBoundingClientRect(), а не entries[0].contentRect: contentRect не
      // включает padding самого измеряемого элемента — если у него есть
      // padding (как у обёртки пузыря), пружина получала бы размер без него
      // и чуть обрезала содержимое.
      const target = entries[0]?.target;
      if (target) setWidth(target.getBoundingClientRect().width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return width;
}
