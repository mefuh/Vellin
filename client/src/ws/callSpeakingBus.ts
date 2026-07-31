type Listener = (userId: string, speaking: boolean) => void;

export interface SpeakingBus {
  emit(userId: string, speaking: boolean): void;
  on(listener: Listener): () => void;
}

/**
 * Pub-sub bridge between the socket layer (which receives speaking relay
 * messages) and the `useCall` hook (which merges them into the local
 * `speaking` set used by the UI). Kept out of Zustand on purpose — it's
 * transient and high-frequency-ish (a couple events per second per active
 * speaker); routing through a store would re-render every subscriber.
 *
 * Фабрика по той же причине, что и шина сигналинга: комнатный звонок и звонок
 * в личных сообщениях не должны видеть события друг друга.
 */
export function createSpeakingBus(): SpeakingBus {
  const listeners = new Set<Listener>();
  return {
    emit(userId, speaking) {
      for (const l of listeners) l(userId, speaking);
    },
    on(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Шина комнатного звонка — её наполняет `useRoomSync`. */
export const callSpeakingBus = createSpeakingBus();
