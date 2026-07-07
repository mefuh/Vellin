import { create } from 'zustand';

/**
 * Координатор беззвучного превью-автоплея видео-«кружков»: разрешает
 * воспроизводить превью ТОЛЬКО одному кружку одновременно — самому видимому
 * (наибольшая доля пересечения с вьюпортом) среди тех, что сейчас в кадре.
 *
 * Раньше каждый {@link import('../components/messages/video/CircularVideoPlayer').CircularVideoPlayer}
 * решал сам по себе (свой IntersectionObserver, свой autoplay) — если в чате
 * подряд идёт несколько кружков и 2+ из них видны одновременно, это означало
 * несколько параллельных decode-сессий `<video>`. На iOS Safari аппаратный
 * пул видео-декодеров ограничен на уровне ОС (это лимит подсистемы, а не
 * мощности чипа) — конкуренция за него при старте «настоящего» воспроизведения
 * (unmute+seek+play) — вероятная причина рывков независимо от производительности
 * устройства. Один активный превью-слот убирает эту конкуренцию совсем.
 */
interface VideoPreviewState {
  /** id кружка, которому сейчас разрешено беззвучно проигрывать превью. */
  activeId: string | null;
  /** id видимого (≥50%) кружка → его доля пересечения с вьюпортом. */
  candidates: Map<string, number>;
  /** Кружок видим (ratio > 0) или вышел из кадра (ratio 0) — обновить кандидата. */
  report: (id: string, ratio: number) => void;
  /** Кружок размонтирован — убрать из кандидатов совсем. */
  clear: (id: string) => void;
}

function pickBest(candidates: Map<string, number>): string | null {
  let best: string | null = null;
  let bestRatio = 0;
  for (const [id, ratio] of candidates) {
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = id;
    }
  }
  return best;
}

export const useVideoPreviewStore = create<VideoPreviewState>((set, get) => ({
  activeId: null,
  candidates: new Map(),

  report: (id, ratio) => {
    const candidates = new Map(get().candidates);
    if (ratio > 0) candidates.set(id, ratio);
    else candidates.delete(id);
    set({ candidates, activeId: pickBest(candidates) });
  },

  clear: (id) => {
    if (!get().candidates.has(id)) return;
    const candidates = new Map(get().candidates);
    candidates.delete(id);
    set({ candidates, activeId: pickBest(candidates) });
  },
}));
