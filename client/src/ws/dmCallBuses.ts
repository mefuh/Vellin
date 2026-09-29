import { createSignalBus } from './callSignalBus';
import { createSpeakingBus } from './callSpeakingBus';

/**
 * Шины звонка в личных сообщениях. Отдельные от комнатных: сообщения ходят по
 * другому каналу, и смешивать их нельзя. Как и в комнате, они намеренно вне
 * стора — SDP, ICE и индикаторы речи не должны перерисовывать интерфейс.
 */
export const dmCallSignalBus = createSignalBus();
export const dmCallSpeakingBus = createSpeakingBus();

/**
 * Состояние медиа собеседника плюс приметы дорожки демонстрации: по ним
 * приёмник отличает её от камеры (см. `useCall.setScreenHint`).
 */
export interface DmCallMediaEvent {
  audio: boolean;
  video: boolean;
  screen: boolean;
  screenMid?: string;
  screenStreamId?: string;
}

type MediaListener = (fromUserId: string, media: DmCallMediaEvent) => void;

/** Микрофон, камера и демонстрация собеседника — мимо стора, приходят часто. */
export const dmCallMediaBus = (() => {
  const listeners = new Set<MediaListener>();
  return {
    emit(fromUserId: string, media: DmCallMediaEvent): void {
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
