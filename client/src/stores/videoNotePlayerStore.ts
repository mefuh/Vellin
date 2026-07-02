import { create } from 'zustand';
import { useVoicePlayerStore } from './voicePlayerStore';

/**
 * Единое активное воспроизведение видео-«кружков» со звуком: одновременно звучит
 * только один. В отличие от голосовых, у каждого кружка свой `<video>` (нужны
 * кадры превью), поэтому стор не держит общий элемент, а РЕГИСТРИРУЕТ активный
 * `<video>` (его отдаёт {@link CircularVideoPlayer} при входе в полный режим) и
 * даёт мини-плееру «сейчас играет» управление: пауза, скорость, закрытие.
 */
const RATES = [1, 1.5, 2] as const;

/** Резолвер следующего кружка для авто-проигрывания (или null — цепочка кончилась). */
export type VideoNextResolver = (currentId: string) => string | null;

interface VideoNotePlayerState {
  currentId: string | null;
  playing: boolean;
  positionSec: number;
  durationSec: number;
  rate: number;
  /** id кружка, который должен САМ запуститься в полном режиме (авто-next). */
  autoPlayId: string | null;
  _video: HTMLVideoElement | null;
  _detach: (() => void) | null;
  _next: VideoNextResolver | null;

  /** Кружок вошёл в полный режим — регистрируем его видео как активное. */
  setActive: (id: string, video: HTMLVideoElement, durationSec: number) => void;
  /** Кружок сам вышел из полного режима (конец/повторный тап/вытеснен). */
  clear: (id: string) => void;
  /** Пауза/продолжение активного (мини-плеер). */
  toggleCurrent: () => void;
  /** Переключить скорость (общая для кружков). */
  cycleRate: () => void;
  /** Закрыть мини-плеер: пауза + возврат активного кружка в превью. */
  stop: () => void;
  /** Задать резолвер следующего кружка (авто-next после полного проигрывания). */
  setNextResolver: (fn: VideoNextResolver | null) => void;
  /** Запланировать авто-запуск следующего после `currentId`. true — следующий найден. */
  playNext: (currentId: string) => boolean;
}

export const useVideoNotePlayerStore = create<VideoNotePlayerState>((set, get) => {
  function detach(): void {
    const d = get()._detach;
    if (d) d();
    set({ _detach: null });
  }
  return {
    currentId: null,
    playing: false,
    positionSec: 0,
    durationSec: 0,
    rate: 1,
    autoPlayId: null,
    _video: null,
    _detach: null,
    _next: null,

    setActive: (id, video, durationSec) => {
      // Не допускаем двух звуков: глушим голосовое, если оно играло.
      useVoicePlayerStore.getState().stop();
      detach();
      video.playbackRate = get().rate;
      const onPlay = (): void => set({ playing: true });
      const onPause = (): void => set({ playing: false });
      const onTime = (): void =>
        set({
          positionSec: video.currentTime,
          durationSec: Number.isFinite(video.duration) && video.duration > 0 ? video.duration : durationSec,
        });
      video.addEventListener('play', onPlay);
      video.addEventListener('pause', onPause);
      video.addEventListener('timeupdate', onTime);
      set({
        currentId: id,
        _video: video,
        _detach: () => {
          video.removeEventListener('play', onPlay);
          video.removeEventListener('pause', onPause);
          video.removeEventListener('timeupdate', onTime);
        },
        playing: !video.paused,
        positionSec: 0,
        durationSec,
        autoPlayId: null, // сигнал авто-запуска потреблён
      });
    },

    clear: (id) => {
      if (get().currentId !== id) return;
      detach();
      set({ currentId: null, _video: null, playing: false, positionSec: 0, durationSec: 0 });
    },

    toggleCurrent: () => {
      const v = get()._video;
      if (!v) return;
      if (v.paused) {
        v.playbackRate = get().rate;
        void v.play().catch(() => {});
      } else {
        v.pause();
      }
    },

    cycleRate: () => {
      const idx = RATES.indexOf(get().rate as (typeof RATES)[number]);
      const rate = RATES[(idx + 1) % RATES.length];
      const v = get()._video;
      if (v) v.playbackRate = rate;
      set({ rate });
    },

    // Закрытие: пауза + сброс currentId. Активный кружок увидит смену currentId и
    // сам вернётся в беззвучное превью (эффект в CircularVideoPlayer).
    stop: () => {
      const v = get()._video;
      if (v) v.pause();
      detach();
      set({ currentId: null, _video: null, playing: false, positionSec: 0, durationSec: 0, autoPlayId: null });
    },

    setNextResolver: (fn) => set({ _next: fn }),

    // Авто-next: резолвим следующий кружок и «бросаем» его id — целевой плеер сам
    // подхватит autoPlayId и запустится в полном режиме (setActive сменит currentId,
    // предыдущий вернётся в превью). Возврат: найден ли следующий.
    playNext: (currentId) => {
      const next = get()._next?.(currentId) ?? null;
      if (next) {
        set({ autoPlayId: next });
        return true;
      }
      return false;
    },
  };
});
