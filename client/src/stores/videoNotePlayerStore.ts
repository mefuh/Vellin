import { create } from 'zustand';
import { useVoicePlayerStore } from './voicePlayerStore';
import type { MediaNextResolver } from './mediaChain';

/**
 * Единое активное воспроизведение видео-«кружков» со звуком: одновременно звучит
 * только один. В отличие от голосовых, у каждого кружка свой `<video>` (нужны
 * кадры превью), поэтому стор не держит общий элемент, а РЕГИСТРИРУЕТ активный
 * `<video>` (его отдаёт {@link CircularVideoPlayer} при входе в полный режим) и
 * даёт мини-плееру «сейчас играет» управление: пауза, скорость, закрытие.
 *
 * Резолвер общий с голосовыми ({@link MediaNextResolver}): следующим может
 * оказаться голосовое — тогда эстафету принимает voicePlayerStore.
 */
export type VideoNextResolver = MediaNextResolver;

const RATES = [1, 1.5, 2] as const;

interface VideoNotePlayerState {
  currentId: string | null;
  playing: boolean;
  positionSec: number;
  durationSec: number;
  rate: number;
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
  /**
   * Текущий кружок доиграл — продолжить цепочку. Возврат: true — эстафета
   * передана (следующее голосовое запущено), false — цепочка остановлена (дальше
   * кружок или конец списка; кружок автозапускать нельзя — iOS требует тап).
   */
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
    _video: null,
    _detach: null,
    _next: null,

    setActive: (id, video, durationSec) => {
      // Не допускаем двух звуков: глушим голосовое, если оно играло.
      useVoicePlayerStore.getState().stop();
      detach();
      video.playbackRate = get().rate;
      // Позицию тянем через rAF (как у голосовых, tick() в voicePlayerStore), а не
      // через нативный `timeupdate` — он у видео заметно реже (браузеры троттлят
      // его сильнее, чем у `<audio>`), из-за чего кольцо/прогресс мини-плеера
      // обновлялись рывками. rAF даёт ровные 60 кадров/с, как и у голосовых.
      let raf: number | null = null;
      const tick = (): void => {
        set({
          positionSec: video.currentTime,
          durationSec: Number.isFinite(video.duration) && video.duration > 0 ? video.duration : durationSec,
        });
        if (!video.paused) raf = requestAnimationFrame(tick);
      };
      const onPlay = (): void => {
        set({ playing: true });
        if (raf != null) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(tick);
      };
      const onPause = (): void => {
        set({ playing: false });
        if (raf != null) cancelAnimationFrame(raf);
        raf = null;
      };
      video.addEventListener('play', onPlay);
      video.addEventListener('pause', onPause);
      set({
        currentId: id,
        _video: video,
        _detach: () => {
          video.removeEventListener('play', onPlay);
          video.removeEventListener('pause', onPause);
          if (raf != null) cancelAnimationFrame(raf);
          raf = null;
        },
        playing: !video.paused,
        positionSec: 0,
        durationSec,
      });
      // Если кружок УЖЕ играл (беззвучное превью самого видимого) в момент входа
      // в полный режим — события `play` больше не будет, поэтому rAF-цикл нужно
      // запустить здесь напрямую; иначе positionSec не обновлялся бы и кольцо
      // прогресса стояло бы на месте, хотя видео идёт.
      if (!video.paused) raf = requestAnimationFrame(tick);
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
      set({ currentId: null, _video: null, playing: false, positionSec: 0, durationSec: 0 });
    },

    setNextResolver: (fn) => set({ _next: fn }),

    // Продолжение цепочки после конца кружка. Голосовое — отдаём эстафету
    // voicePlayerStore напрямую (общий <audio> уже разблокирован тапом), возврат
    // false, чтобы этот кружок закрылся в превью. Кружок дальше — НЕ автозапускаем
    // (iOS требует тап для видео со звуком): цепочка стопорится, возврат false.
    playNext: (currentId) => {
      const next = get()._next?.(currentId) ?? null;
      if (next?.kind === 'voice') {
        useVoicePlayerStore.getState().toggle(next.id, next.url, next.durationSec);
      }
      return false;
    },
  };
});
