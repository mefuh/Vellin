import { useEffect, useState } from 'react';

export interface ViewportMetrics {
  /** Высота видимой области (без области, занятой экранной клавиатурой). */
  height: number;
  /** Смещение видимой области сверху (когда страница «уехала» под клавиатуру). */
  offsetTop: number;
}

/**
 * Метрики `window.visualViewport` — чтобы контейнер чата подстраивался под
 * выезжающую экранную клавиатуру (мобильные браузеры не сжимают layout viewport,
 * клавиатура просто перекрывает контент). Возвращает `null`, если API недоступно
 * или хук отключён — тогда вызывающий код использует обычный `100svh`.
 */
export function useVisualViewport(enabled: boolean): ViewportMetrics | null {
  const [vp, setVp] = useState<ViewportMetrics | null>(null);

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!enabled || !vv) {
      setVp(null);
      return;
    }
    const update = (): void => setVp({ height: vv.height, offsetTop: vv.offsetTop });
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [enabled]);

  return vp;
}
