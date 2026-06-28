import { useEffect, useState } from 'react';

const prefersReduced = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Присутствие элемента для симметричных анимаций появления/исчезания на
 * CSS-transition (без сторонних библиотек). Пока `show=true` — `open=true`
 * (показан); когда `show` становится false — `open` сбрасывается (играет
 * обратная анимация), и спустя `ms` элемент размонтируется. При reduce-motion
 * размонтаж мгновенный. Стартовый кадр входа фиксируется двойным rAF, иначе
 * браузер не увидит начальное состояние и переход не сыграет.
 */
export function usePresence(show: boolean, ms = 200): { mounted: boolean; open: boolean } {
  const [mounted, setMounted] = useState(show);
  const [open, setOpen] = useState(show);

  useEffect(() => {
    if (show) {
      setMounted(true);
      return;
    }
    if (mounted) {
      setOpen(false);
      const t = window.setTimeout(() => setMounted(false), prefersReduced() ? 0 : ms);
      return () => window.clearTimeout(t);
    }
  }, [show, mounted, ms]);

  useEffect(() => {
    if (mounted && show && !open) {
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
      return () => cancelAnimationFrame(id);
    }
  }, [mounted, show, open]);

  return { mounted, open };
}
