import { useEffect, useState } from 'react';

export interface ViewportMetrics {
  /** Высота видимой области visualViewport (как есть). */
  height: number;
  /** Смещение видимой области сверху. */
  offsetTop: number;
  /** Высота, «съеденная» экранной клавиатурой снизу (0 — клавиатуры нет). */
  keyboardHeight: number;
}

/**
 * Метрики `window.visualViewport` для чата. Главное — `keyboardHeight`: высота
 * выехавшей клавиатуры, вычисленная как (максимально наблюдавшаяся высота −
 * текущая). Так мы НЕ зависим от абсолютного значения `visualViewport.height`
 * (в iOS standalone оно может приходить короче реального экрана — из-за этого
 * нижняя панель «всплывала» выше дна). Считаем только дельту: когда клавиатуры
 * нет — keyboardHeight = 0, контейнер занимает весь `100dvh`.
 *
 * Возвращает `null`, если API недоступно или хук отключён.
 */
export function useVisualViewport(enabled: boolean): ViewportMetrics | null {
  const [vp, setVp] = useState<ViewportMetrics | null>(null);

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!enabled || !vv) {
      setVp(null);
      return;
    }
    // База = «высота без клавиатуры». Берём максимум наблюдавшейся высоты;
    // сбрасываем при смене ориентации (меняется ширина окна).
    let base = 0;
    let lastWidth = window.innerWidth;
    const update = (): void => {
      if (window.innerWidth !== lastWidth) {
        lastWidth = window.innerWidth;
        base = 0;
      }
      base = Math.max(base, vv.height);
      const keyboardHeight = Math.max(0, Math.round(base - vv.height));
      setVp({ height: vv.height, offsetTop: vv.offsetTop, keyboardHeight });
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('orientationchange', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [enabled]);

  return vp;
}
