type Listener = (userId: string, speaking: boolean) => void;

/**
 * Pub-sub bridge between `useRoomSync` (which receives `call_peer_speaking`
 * relay messages) and the `useCall` hook (which merges them into the local
 * `speaking` set used by the UI). Kept out of Zustand on purpose — it's
 * transient and high-frequency-ish (a couple events per second per active
 * speaker); routing through a store would re-render every subscriber.
 */
const listeners = new Set<Listener>();

export const callSpeakingBus = {
  emit(userId: string, speaking: boolean): void {
    for (const l of listeners) l(userId, speaking);
  },
  on(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
