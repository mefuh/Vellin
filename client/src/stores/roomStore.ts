import { create } from 'zustand';
import type {
  ChatMessage,
  ParticipantInfo,
  PlaylistItem,
  ReactionEvent,
  RoomDetails,
  RoomPermissions,
  RoomRole,
  VideoState,
} from '@vellin/shared';

interface RoomState {
  room: RoomDetails | null;
  participants: ParticipantInfo[];
  video: VideoState | null;
  playlist: PlaylistItem[];
  historyLength: number;
  you: ParticipantInfo | null;
  messages: ChatMessage[];
  reactions: ReactionEvent[];
  kicked: boolean;
  setRoom: (room: RoomDetails | null) => void;
  reset: () => void;
  applyWelcome: (data: {
    you: ParticipantInfo;
    participants: ParticipantInfo[];
    video: VideoState;
    recentMessages: ChatMessage[];
    playlist: PlaylistItem[];
    historyLength: number;
  }) => void;
  upsertParticipant: (p: ParticipantInfo) => void;
  removeParticipant: (userId: string) => void;
  applyPermissionsUpdate: (
    userId: string,
    role: RoomRole,
    permissions: RoomPermissions,
  ) => void;
  setPlaylist: (items: PlaylistItem[], historyLength: number) => void;
  setKicked: (v: boolean) => void;
  appendMessage: (m: ChatMessage) => void;
  appendReaction: (r: ReactionEvent) => void;
  removeReaction: (id: string) => void;
  updateVideo: (updater: (v: VideoState | null) => VideoState | null) => void;
  setVideoUrl: (url: string, video: VideoState) => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  room: null,
  participants: [],
  video: null,
  playlist: [],
  historyLength: 0,
  you: null,
  messages: [],
  reactions: [],
  kicked: false,

  setRoom: (room) => set({ room }),

  reset: () =>
    set({
      room: null,
      participants: [],
      video: null,
      playlist: [],
      historyLength: 0,
      you: null,
      messages: [],
      reactions: [],
      kicked: false,
    }),

  applyWelcome: ({ you, participants, video, recentMessages, playlist, historyLength }) =>
    set({
      you,
      participants,
      video,
      playlist,
      historyLength,
      messages: recentMessages,
    }),

  upsertParticipant: (p) =>
    set((s) => {
      const filtered = s.participants.filter((x) => x.userId !== p.userId);
      return { participants: [...filtered, p] };
    }),

  removeParticipant: (userId) =>
    set((s) => ({ participants: s.participants.filter((p) => p.userId !== userId) })),

  applyPermissionsUpdate: (userId, role, permissions) =>
    set((s) => {
      const participants = s.participants.map((p) =>
        p.userId === userId ? { ...p, role, permissions, isHost: role === 'owner' } : p,
      );
      const you =
        s.you && s.you.userId === userId
          ? { ...s.you, role, permissions, isHost: role === 'owner' }
          : s.you;
      return { participants, you };
    }),

  setPlaylist: (items, historyLength) => set({ playlist: items, historyLength }),

  setKicked: (v) => set({ kicked: v }),

  appendMessage: (m) =>
    set((s) => {
      if (s.messages.some((x) => x.id === m.id)) return s;
      return { messages: [...s.messages, m] };
    }),

  appendReaction: (r) =>
    set((s) => ({ reactions: [...s.reactions.slice(-20), r] })),

  removeReaction: (id) => set((s) => ({ reactions: s.reactions.filter((r) => r.id !== id) })),

  updateVideo: (updater) => set((s) => ({ video: updater(s.video) })),

  setVideoUrl: (url, video) =>
    set((s) => ({
      video,
      room: s.room ? { ...s.room, videoUrl: url, videoPositionSec: 0, videoStatus: 'paused' } : s.room,
    })),
}));
