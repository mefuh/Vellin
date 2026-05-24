import type { CallSignalPayload } from '@vellin/shared';

type Listener = (fromUserId: string, payload: CallSignalPayload) => void;

/**
 * Tiny pub-sub bridge between `useRoomSync` (which receives `call_signal_relay`
 * messages) and the `useCall` hook (which feeds them to `RTCPeerConnection`s).
 * Not in Zustand on purpose — SDP/ICE traffic must not trigger React renders.
 */
const listeners = new Set<Listener>();

export const callSignalBus = {
  emit(fromUserId: string, payload: CallSignalPayload): void {
    for (const l of listeners) l(fromUserId, payload);
  },
  on(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
