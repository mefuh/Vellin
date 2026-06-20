import { create } from 'zustand';
import type {
  CallMember,
  CallSnapshot,
  ChatMessage,
  ParticipantInfo,
  PlaylistItem,
  ReactionEvent,
  RoomDetails,
  RoomPermissions,
  RoomRole,
  RtcConfig,
  SyncStatus,
  VideoState,
} from '@vellin/shared';

const EMPTY_CALL: CallSnapshot = { members: [], startedByUserId: null, startedAt: null };

export type MyCallState = 'idle' | 'connecting' | 'in';

interface RoomState {
  room: RoomDetails | null;
  participants: ParticipantInfo[];
  video: VideoState | null;
  /** Видео в процессе смены (от сигнала сервера до прихода set_url). null — нет. */
  videoLoading: { title?: string; sourceUrl?: string } | null;
  playlist: PlaylistItem[];
  historyLength: number;
  you: ParticipantInfo | null;
  messages: ChatMessage[];
  reactions: ReactionEvent[];
  kicked: boolean;
  /** Состояние умной синхронизации (питает информер в плеере). */
  syncStatus: SyncStatus | null;
  /** Server-authoritative voice/video call membership in this room. */
  call: CallSnapshot;
  /** ICE servers handed to RTCPeerConnection — supplied by welcome. */
  rtc: RtcConfig | null;
  /** Local call-state machine. */
  myCallState: MyCallState;
  /** Local mic/cam intent — kept in sync with server-confirmed state. */
  myMedia: { audio: boolean; video: boolean };
  setRoom: (room: RoomDetails | null) => void;
  reset: () => void;
  applyWelcome: (data: {
    you: ParticipantInfo;
    participants: ParticipantInfo[];
    video: VideoState;
    recentMessages: ChatMessage[];
    playlist: PlaylistItem[];
    historyLength: number;
    call: CallSnapshot;
    rtc: RtcConfig;
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
  setSyncStatus: (s: SyncStatus | null) => void;
  appendMessage: (m: ChatMessage) => void;
  appendReaction: (r: ReactionEvent) => void;
  removeReaction: (id: string) => void;
  updateVideo: (updater: (v: VideoState | null) => VideoState | null) => void;
  setVideoUrl: (url: string, video: VideoState) => void;
  setVideoLoading: (v: { title?: string; sourceUrl?: string } | null) => void;
  applyCallSnapshot: (snapshot: CallSnapshot) => void;
  upsertCallMember: (member: CallMember) => void;
  removeCallMember: (userId: string) => void;
  setCallMemberMedia: (userId: string, audio: boolean, video: boolean) => void;
  setMyCallState: (s: MyCallState) => void;
  setMyMedia: (m: { audio: boolean; video: boolean }) => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  room: null,
  participants: [],
  video: null,
  videoLoading: null,
  playlist: [],
  historyLength: 0,
  you: null,
  messages: [],
  reactions: [],
  kicked: false,
  syncStatus: null,
  call: EMPTY_CALL,
  rtc: null,
  myCallState: 'idle',
  myMedia: { audio: false, video: false },

  setRoom: (room) => set({ room }),

  reset: () =>
    set({
      room: null,
      participants: [],
      video: null,
      videoLoading: null,
      playlist: [],
      historyLength: 0,
      you: null,
      messages: [],
      reactions: [],
      kicked: false,
      syncStatus: null,
      call: EMPTY_CALL,
      rtc: null,
      myCallState: 'idle',
      myMedia: { audio: false, video: false },
    }),

  applyWelcome: ({ you, participants, video, recentMessages, playlist, historyLength, call, rtc }) =>
    set({
      you,
      participants,
      video,
      videoLoading: null,
      playlist,
      historyLength,
      messages: recentMessages,
      call,
      rtc,
    }),

  upsertParticipant: (p) =>
    set((s) => {
      const filtered = s.participants.filter((x) => x.userId !== p.userId);
      return { participants: [...filtered, p] };
    }),

  removeParticipant: (userId) =>
    set((s) => ({ participants: s.participants.filter((p) => p.userId !== userId) })),

  setSyncStatus: (syncStatus) => set({ syncStatus }),

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
      // Новое видео пришло — фаза резолва завершена; дальше индикатор держит сам
      // плеер по флагу готовности движка.
      videoLoading: null,
      room: s.room ? { ...s.room, videoUrl: url, videoPositionSec: 0, videoStatus: 'paused' } : s.room,
    })),

  setVideoLoading: (videoLoading) => set({ videoLoading }),

  applyCallSnapshot: (snapshot) => set({ call: snapshot }),

  upsertCallMember: (member) =>
    set((s) => {
      const others = s.call.members.filter((m) => m.userId !== member.userId);
      const members = [...others, member].sort((a, b) => a.joinedAt - b.joinedAt);
      const started = s.call.members.length === 0;
      return {
        call: {
          members,
          startedByUserId: started ? member.userId : s.call.startedByUserId,
          startedAt: started ? member.joinedAt : s.call.startedAt,
        },
      };
    }),

  removeCallMember: (userId) =>
    set((s) => {
      const members = s.call.members.filter((m) => m.userId !== userId);
      const empty = members.length === 0;
      return {
        call: {
          members,
          startedByUserId: empty ? null : s.call.startedByUserId,
          startedAt: empty ? null : s.call.startedAt,
        },
      };
    }),

  setCallMemberMedia: (userId, audio, video) =>
    set((s) => ({
      call: {
        ...s.call,
        members: s.call.members.map((m) => (m.userId === userId ? { ...m, audio, video } : m)),
      },
    })),

  setMyCallState: (myCallState) => set({ myCallState }),

  setMyMedia: (myMedia) => set({ myMedia }),
}));
