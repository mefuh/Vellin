import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Per-user call preferences that persist across sessions: chosen mic / camera
 * device IDs, whether the local self-view is mirrored, and per-peer playback
 * volume (0..1). Lives outside `roomStore` because none of this belongs to the
 * room — it follows the human, not the room.
 */
export type CircleSize = 'small' | 'standard' | 'large';

/**
 * Position of a circle tile in the fullscreen overlay, stored as a fraction
 * of the player container so it survives resizes / windowed↔fullscreen.
 * Origin = top-left corner of the player; (0,0) == top-left, (1,1) == bottom-right.
 */
export interface TilePosition {
  fx: number;
  fy: number;
}

export interface CallSettingsState {
  preferredMicId: string | null;
  preferredCameraId: string | null;
  mirrorSelfVideo: boolean;
  /**
   * Visual size of the Telegram-style circle tiles + audio-only avatar
   * bubbles in the fullscreen overlay. Doesn't affect the rect tiles in
   * the chat panel.
   */
  circleSize: CircleSize;
  /**
   * Per-userId positions for tiles the user has manually dragged in the
   * fullscreen overlay. Tiles missing here use the default top-right stack.
   */
  tilePositions: Record<string, TilePosition>;
  // keyed by peer userId. Missing entry == 1.0 (full volume).
  peerVolumes: Record<string, number>;

  setPreferredMicId: (id: string | null) => void;
  setPreferredCameraId: (id: string | null) => void;
  setMirrorSelfVideo: (on: boolean) => void;
  setCircleSize: (size: CircleSize) => void;
  setTilePosition: (userId: string, pos: TilePosition) => void;
  resetTilePositions: () => void;
  setPeerVolume: (userId: string, vol: number) => void;
  resetPeerVolume: (userId: string) => void;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export const useCallSettingsStore = create<CallSettingsState>()(
  persist(
    (set) => ({
      preferredMicId: null,
      preferredCameraId: null,
      // Off by default — toggling on physically flips the outbound camera
      // track via a canvas pipeline (visible to everyone, not just self).
      mirrorSelfVideo: false,
      circleSize: 'standard',
      tilePositions: {},
      peerVolumes: {},

      setPreferredMicId: (id) => set({ preferredMicId: id }),
      setPreferredCameraId: (id) => set({ preferredCameraId: id }),
      setMirrorSelfVideo: (on) => set({ mirrorSelfVideo: on }),
      setCircleSize: (size) => set({ circleSize: size }),
      setTilePosition: (userId, pos) =>
        set((s) => ({
          tilePositions: {
            ...s.tilePositions,
            [userId]: { fx: clamp01(pos.fx), fy: clamp01(pos.fy) },
          },
        })),
      resetTilePositions: () => set({ tilePositions: {} }),
      setPeerVolume: (userId, vol) =>
        set((s) => ({ peerVolumes: { ...s.peerVolumes, [userId]: clamp01(vol) } })),
      resetPeerVolume: (userId) =>
        set((s) => {
          if (!(userId in s.peerVolumes)) return s;
          const next = { ...s.peerVolumes };
          delete next[userId];
          return { peerVolumes: next };
        }),
    }),
    {
      name: 'vellin:call-settings',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);

export const getPeerVolume = (userId: string): number =>
  useCallSettingsStore.getState().peerVolumes[userId] ?? 1;
