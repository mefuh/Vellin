import type { CallSignalPayload } from '@vellin/shared';

type Listener = (fromUserId: string, payload: CallSignalPayload) => void;

export interface SignalBus {
  emit(fromUserId: string, payload: CallSignalPayload): void;
  on(listener: Listener): () => void;
}

/**
 * Tiny pub-sub bridge between the socket layer (which receives signal relay
 * messages) and the `useCall` hook (which feeds them to `RTCPeerConnection`s).
 * Not in Zustand on purpose — SDP/ICE traffic must not trigger React renders.
 *
 * Фабрика, а не единственный экземпляр: у комнатного звонка и у звонка в
 * личных сообщениях шины разные, иначе каждый хук получал бы чужие сигналы.
 */
export function createSignalBus(): SignalBus {
  const listeners = new Set<Listener>();
  return {
    emit(fromUserId, payload) {
      for (const l of listeners) l(fromUserId, payload);
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
export const callSignalBus = createSignalBus();
