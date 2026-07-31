import { createSignalBus } from './callSignalBus';
import { createSpeakingBus } from './callSpeakingBus';

/**
 * Шины звонка в личных сообщениях. Отдельные от комнатных: сообщения ходят по
 * другому каналу, и смешивать их нельзя. Как и в комнате, они намеренно вне
 * стора — SDP, ICE и индикаторы речи не должны перерисовывать интерфейс.
 */
export const dmCallSignalBus = createSignalBus();
export const dmCallSpeakingBus = createSpeakingBus();

type MediaListener = (fromUserId: string, media: { audio: boolean; video: boolean }) => void;

/** Микрофон и камера собеседника — тоже мимо стора, приходят часто. */
export const dmCallMediaBus = (() => {
  const listeners = new Set<MediaListener>();
  return {
    emit(fromUserId: string, media: { audio: boolean; video: boolean }): void {
      for (const l of listeners) l(fromUserId, media);
    },
    on(listener: MediaListener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
})();
