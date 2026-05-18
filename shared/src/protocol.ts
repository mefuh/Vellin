import type {
  ChatMessage,
  ParticipantInfo,
  PlaylistItem,
  ReactionEvent,
  RoomPermissions,
  RoomRole,
  VideoState,
  VideoStatus,
} from './domain.js';

// ── Client → Server ─────────────────────────────────────────────────────
export type C2S =
  | C2SHello
  | C2SChatMessage
  | C2SVideoPlay
  | C2SVideoPause
  | C2SVideoSeek
  | C2SVideoSetUrl
  | C2SVideoEnded
  | C2SReaction
  | C2SPong
  | C2SSyncRequest
  | C2SPlaylistAdd
  | C2SPlaylistRemove
  | C2SPlaylistReorder
  | C2SPlaylistPlay
  | C2SPlaylistPrev;

export interface C2SHello {
  t: 'hello';
  clientTs: number;
}
export interface C2SChatMessage {
  t: 'chat_message';
  body: string;
  clientTs: number;
  /** Local idempotency key — echoed back on the server-confirmed message so clients can de-dup. */
  nonce: string;
}
export interface C2SVideoPlay {
  t: 'video_play';
  positionSec: number;
  clientTs: number;
}
export interface C2SVideoPause {
  t: 'video_pause';
  positionSec: number;
  clientTs: number;
}
export interface C2SVideoSeek {
  t: 'video_seek';
  positionSec: number;
  /** Whether playback should be playing after the seek. */
  playing: boolean;
  clientTs: number;
}
export interface C2SVideoSetUrl {
  t: 'video_set_url';
  url: string;
  clientTs: number;
}
export interface C2SVideoEnded {
  t: 'video_ended';
  /** The URL that just finished — used for race-safe playlist advance. */
  currentUrl: string;
  clientTs: number;
}
export interface C2SReaction {
  t: 'reaction';
  emoji: string;
  clientTs: number;
}
export interface C2SPong {
  t: 'pong';
  serverTs: number;
  clientTs: number;
}
export interface C2SSyncRequest {
  t: 'sync_request';
  clientTs: number;
}
export interface C2SPlaylistAdd {
  t: 'playlist_add';
  url: string;
  title?: string;
  clientTs: number;
}
export interface C2SPlaylistRemove {
  t: 'playlist_remove';
  itemId: string;
  clientTs: number;
}
export interface C2SPlaylistReorder {
  t: 'playlist_reorder';
  /** Full new order of item IDs. */
  itemIds: string[];
  clientTs: number;
}
export interface C2SPlaylistPlay {
  t: 'playlist_play';
  /** Item from the playlist to play now (removes it from the queue). */
  itemId: string;
  clientTs: number;
}
export interface C2SPlaylistPrev {
  t: 'playlist_prev';
  clientTs: number;
}

// ── Server → Client ─────────────────────────────────────────────────────
export type S2C =
  | S2CWelcome
  | S2CUserJoin
  | S2CUserLeave
  | S2CChatMessage
  | S2CVideoApply
  | S2CVideoSync
  | S2CVideoSetUrl
  | S2CReaction
  | S2CRoomStateUpdate
  | S2CPlaylistUpdate
  | S2CPermissionsUpdate
  | S2CUserKicked
  | S2CPing
  | S2CError;

export interface S2CWelcome {
  t: 'welcome';
  serverTs: number;
  you: ParticipantInfo;
  participants: ParticipantInfo[];
  video: VideoState;
  recentMessages: ChatMessage[];
  playlist: PlaylistItem[];
  /** Number of items in playback history (enables the "previous" button). */
  historyLength: number;
  /** @deprecated Legacy flag — clients should derive controls from `you.permissions`. */
  hostOnlyControl: boolean;
}
export interface S2CUserJoin {
  t: 'user_join';
  participant: ParticipantInfo;
  serverTs: number;
}
export interface S2CUserLeave {
  t: 'user_leave';
  userId: string;
  serverTs: number;
}
export interface S2CChatMessage {
  t: 'chat_message';
  message: ChatMessage;
  /** Echoes C2S nonce when the original sender's message is broadcast back. */
  nonce?: string;
}
export interface S2CVideoApply {
  t: 'video_apply';
  action: 'play' | 'pause' | 'seek';
  positionSec: number;
  anchorServerTs: number;
  emittedServerTs: number;
  status: VideoStatus;
  seq: number;
  byUserId: string;
}
export interface S2CVideoSync {
  t: 'video_sync';
  positionSec: number;
  anchorServerTs: number;
  emittedServerTs: number;
  status: VideoStatus;
  seq: number;
}
export interface S2CVideoSetUrl {
  t: 'video_set_url';
  url: string;
  byUserId: string;
  serverTs: number;
  /** Resets video to position 0, paused. */
  video: VideoState;
}
export interface S2CReaction {
  t: 'reaction';
  reaction: ReactionEvent;
}
export interface S2CRoomStateUpdate {
  t: 'room_state_update';
  hostOnlyControl?: boolean;
  hostUserId?: string;
}
export interface S2CPlaylistUpdate {
  t: 'playlist_update';
  playlist: PlaylistItem[];
  /** Number of items in playback history. */
  historyLength: number;
  serverTs: number;
}
export interface S2CPermissionsUpdate {
  t: 'permissions_update';
  userId: string;
  role: RoomRole;
  permissions: RoomPermissions;
  serverTs: number;
}
export interface S2CUserKicked {
  t: 'user_kicked';
  userId: string;
  byUserId: string;
  serverTs: number;
}
export interface S2CPing {
  t: 'ping';
  serverTs: number;
}
export interface S2CError {
  t: 'error';
  code:
    | 'rate_limited'
    | 'no_permission'
    | 'invalid_payload'
    | 'room_full'
    | 'auth_expired'
    | 'internal'
    | 'duplicate_session'
    | 'kicked'
    | 'resolve_failed';
  message: string;
}

// ── Type guards ────────────────────────────────────────────────────────
export function isC2S(value: unknown): value is C2S {
  return typeof value === 'object' && value !== null && typeof (value as { t?: unknown }).t === 'string';
}
