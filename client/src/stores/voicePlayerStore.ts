import { create } from 'zustand';
import { useVideoNotePlayerStore } from './videoNotePlayerStore';
import type { MediaNextResolver } from './mediaChain';

/**
 * Единый аудио-пайплайн для голосовых сообщений: ровно один общий `<audio>` на
 * всё приложение, поэтому одновременно играет только одно голосовое, а после
 * окончания автоматически запускается следующее непрослушанное (auto-next).
 * Компоненты {@link VoicePlayer} — это просто UI поверх этого стора.
 *
 * Резолвер общий с видео-кружками ({@link MediaNextResolver}): следующим может
 * оказаться кружок — тогда эстафету принимает videoNotePlayerStore, а не
 * пропускается в поисках следующего голосового.
 */
export type NextResolver = MediaNextResolver;

const RATES = [1, 1.5, 2] as const;

interface VoicePlayerState {
  /** id сообщения, которое сейчас загружено в плеер (играет или на паузе). */
  currentId: string | null;
  playing: boolean;
  positionSec: number;
  durationSec: number;
  /** Скорость воспроизведения — общая для всех голосовых. */
  rate: number;

  _audio: HTMLAudioElement | null;
  _raf: number | null;
  _next: NextResolver | null;
  _onStart: ((messageId: string) => void) | null;

  toggle: (id: string, url: string, durationSec: number) => void;
  /** Пауза/продолжение текущего без перезагрузки (для мини-плеера). */
  toggleCurrent: () => void;
  seek: (id: string, url: string, durationSec: number, frac: number) => void;
  cycleRate: () => void;
  stop: () => void;
  setNextResolver: (fn: NextResolver | null) => void;
  setOnStart: (fn: ((messageId: string) => void) | null) => void;
}

export const useVoicePlayerStore = create<VoicePlayerState>((set, get) => {
  /** Ленивая инициализация общего <audio> + подписки на события. */
  function ensureAudio(): HTMLAudioElement {
    let audio = get()._audio;
    if (audio) return audio;
    audio = new Audio();
    audio.preload = 'metadata';

    const tick = (): void => {
      const a = get()._audio;
      if (!a) return;
      set({ positionSec: a.currentTime, durationSec: Number.isFinite(a.duration) && a.duration > 0 ? a.duration : get().durationSec });
      if (!a.paused) set({ _raf: requestAnimationFrame(tick) });
    };

    audio.addEventListener('play', () => {
      set({ playing: true });
      const r = get()._raf;
      if (r) cancelAnimationFrame(r);
      set({ _raf: requestAnimationFrame(tick) });
    });
    audio.addEventListener('pause', () => {
      set({ playing: false });
      const r = get()._raf;
      if (r) cancelAnimationFrame(r);
    });
    audio.addEventListener('ended', () => {
      const id = get().currentId;
      const next = id ? get()._next?.(id) ?? null : null;
      if (next?.kind === 'voice') {
        // Следующее — тоже голосовое: продолжаем цепочку сами (общий <audio>
        // уже «разблокирован» первым тапом, iOS играет без нового жеста).
        get().toggle(next.id, next.url, next.durationSec);
      } else {
        // Дальше — видео-кружок ИЛИ конец списка → останавливаемся. Кружок НЕ
        // автозапускаем: iOS запрещает старт видео со звуком без прямого тапа,
        // поэтому цепочка стопорится на кружке, а он ждёт нажатия (см. решение
        // «стоп на кружке, ждём тап»).
        get().stop();
      }
    });

    set({ _audio: audio });
    return audio;
  }

  /** Загрузить новое сообщение в плеер и запустить с начала. */
  function loadAndPlay(id: string, url: string, durationSec: number): void {
    // Не допускаем двух звуков: глушим активный видео-кружок, если он играл.
    useVideoNotePlayerStore.getState().stop();
    const audio = ensureAudio();
    audio.src = url;
    audio.playbackRate = get().rate;
    audio.currentTime = 0;
    set({ currentId: id, positionSec: 0, durationSec });
    void audio.play().catch(() => set({ playing: false }));
    get()._onStart?.(id);
  }

  return {
    currentId: null,
    playing: false,
    positionSec: 0,
    durationSec: 0,
    rate: 1,
    _audio: null,
    _raf: null,
    _next: null,
    _onStart: null,

    toggle: (id, url, durationSec) => {
      const { currentId, _audio, playing } = get();
      if (currentId === id && _audio) {
        if (playing) {
          _audio.pause();
        } else {
          _audio.playbackRate = get().rate;
          void _audio.play().catch(() => set({ playing: false }));
        }
        return;
      }
      loadAndPlay(id, url, durationSec);
    },

    toggleCurrent: () => {
      const { _audio, currentId, playing } = get();
      if (!_audio || !currentId) return;
      if (playing) {
        _audio.pause();
      } else {
        _audio.playbackRate = get().rate;
        void _audio.play().catch(() => set({ playing: false }));
      }
    },

    seek: (id, url, durationSec, frac) => {
      const clamped = Math.max(0, Math.min(1, frac));
      const { currentId, _audio } = get();
      if (currentId === id && _audio) {
        const d = Number.isFinite(_audio.duration) && _audio.duration > 0 ? _audio.duration : durationSec;
        _audio.currentTime = clamped * d;
        set({ positionSec: _audio.currentTime });
        if (_audio.paused) {
          _audio.playbackRate = get().rate;
          void _audio.play().catch(() => set({ playing: false }));
        }
        return;
      }
      // Не текущее — загружаем, затем перематываем на нужную точку.
      loadAndPlay(id, url, durationSec);
      const a = get()._audio;
      if (a) {
        const apply = (): void => {
          const d = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : durationSec;
          a.currentTime = clamped * d;
          set({ positionSec: a.currentTime });
        };
        if (a.readyState >= 1) apply();
        else a.addEventListener('loadedmetadata', apply, { once: true });
      }
    },

    cycleRate: () => {
      const idx = RATES.indexOf(get().rate as (typeof RATES)[number]);
      const rate = RATES[(idx + 1) % RATES.length];
      const a = get()._audio;
      if (a) a.playbackRate = rate;
      set({ rate });
    },

    stop: () => {
      const { _audio, _raf } = get();
      if (_audio) {
        _audio.pause();
        _audio.removeAttribute('src');
      }
      if (_raf) cancelAnimationFrame(_raf);
      set({ currentId: null, playing: false, positionSec: 0, durationSec: 0, _raf: null });
    },

    setNextResolver: (fn) => set({ _next: fn }),
    setOnStart: (fn) => set({ _onStart: fn }),
  };
});
