export type UserKind = 'user' | 'guest';

export interface PublicUser {
  id: string;
  username: string;
  avatarSeed: string;
  kind: UserKind;
}

export interface AuthUser extends PublicUser {
  email: string | null;
  createdAt: string;
  /** True only for the single user whose email matches ADMIN_EMAIL on the server. */
  isAdmin: boolean;
}

export interface RoomSummary {
  id: string;
  slug: string;
  name: string;
  isPrivate: boolean;
  allowGuests: boolean;
  hostOnlyControl: boolean;
  maxParticipants: number;
  ownerId: string;
  ownerUsername: string;
  participantCount: number;
  createdAt: string;
}

export interface RoomDetails extends RoomSummary {
  videoUrl: string | null;
  videoPositionSec: number;
  videoStatus: VideoStatus;
}

export type VideoStatus = 'playing' | 'paused';

/**
 * How the resolved media should be played on the client.
 * - `direct`: plain video file (mp4/webm/ogg) → native `<video>`.
 * - `hls`: m3u8 → hls.js (native in Safari).
 * - `dash`: mpd → shaka-player.
 * - `dual`: separate muxed video-only + audio-only streams (typically YouTube
 *   HD, where progressive caps at 360p). Player must use both `mediaUrl`
 *   (video) and `audioUrl` (audio) and keep them in sync locally.
 * - `torrent`: magnet/.torrent → WebTorrent.
 * - `*_embed`: provider-specific iframe (used as fallback when extraction failed).
 */
export type MediaKind =
  | 'direct'
  | 'hls'
  | 'dash'
  | 'dual'
  | 'torrent'
  | 'youtube_embed'
  | 'rutube_embed'
  | 'vimeo_embed'
  | 'vk_embed';

/**
 * Server-resolved playable source for a user-supplied URL. The client picks
 * an engine by `kind` and feeds `mediaUrl` into it.
 */
export interface ResolvedMedia {
  kind: MediaKind;
  /** Direct stream URL, provider embed URL, or magnet URI. */
  mediaUrl: string;
  /**
   * Companion audio-only URL. Populated only for `kind: 'dual'` — the client
   * plays this through a hidden `<audio>` element synced with `<video>`.
   */
  audioUrl?: string;
  mime?: string;
  title?: string;
  durationSec?: number;
  poster?: string;
  /** Original URL the user submitted (for UX + re-resolve). */
  sourceUrl: string;
  /** Epoch ms when this resolve was produced. */
  resolvedAt: number;
  /** Epoch ms when the mediaUrl is expected to stop working. 0 = no expiry. */
  expiresAt: number;
}

export interface VideoState {
  url: string | null;
  /**
   * Human-friendly name for the currently-playing video. Populated when the
   * video is launched from a playlist item that has a user-provided title.
   * Null for videos set via the raw URL flow — the client falls back to a
   * URL-derived name in that case.
   */
  title: string | null;
  /**
   * Server-resolved playable source. Null when no video is loaded or when an
   * older payload (pre-resolver) is replayed.
   */
  resolved: ResolvedMedia | null;
  positionSec: number;
  anchorServerTs: number;
  status: VideoStatus;
  playbackRate: number;
  lastEventSeq: number;
  hostUserId: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  kind: 'user' | 'system';
  body: string;
  createdAt: string;
  author: ChatAuthor;
}

export interface ChatAuthor {
  id: string;
  username: string;
  avatarSeed: string;
  kind: UserKind;
}

export interface ReactionEvent {
  id: string;
  emoji: string;
  userId: string;
  username: string;
  createdAt: number;
}

/**
 * Роль участника в комнате.
 * - `superadmin`: главный админ сервиса, имеет полный контроль над любой комнатой
 *   (включая возможность кикнуть владельца). Не сохраняется в БД — назначается
 *   на лету при WS-handshake'е с admin-ticket'ом.
 * - `owner`/`admin`/`member`/`guest`: обычная иерархия комнаты.
 */
export type RoomRole = 'superadmin' | 'owner' | 'admin' | 'member' | 'guest';

export interface RoomPermissions {
  canPlayPause: boolean;
  canSeek: boolean;
  canSetVideoUrl: boolean;
  canManagePlaylist: boolean;
}

export const ALL_PERMISSIONS: RoomPermissions = {
  canPlayPause: true,
  canSeek: true,
  canSetVideoUrl: true,
  canManagePlaylist: true,
};

export const DEFAULT_MEMBER_PERMISSIONS: RoomPermissions = {
  canPlayPause: true,
  canSeek: true,
  canSetVideoUrl: false,
  canManagePlaylist: false,
};

export const DEFAULT_GUEST_PERMISSIONS: RoomPermissions = {
  canPlayPause: false,
  canSeek: false,
  canSetVideoUrl: false,
  canManagePlaylist: false,
};

export interface PlaylistItem {
  id: string;
  url: string;
  title?: string;
  addedByUserId: string;
  addedByUsername: string;
  addedAt: number;
}

export interface ParticipantInfo {
  userId: string;
  username: string;
  avatarSeed: string;
  kind: UserKind;
  /** Kept for backward compatibility — equivalent to `role === 'owner'`. */
  isHost: boolean;
  role: RoomRole;
  permissions: RoomPermissions;
  joinedAt: number;
}

/**
 * Расширенная сводка комнаты для админ-панели — включает приватные комнаты
 * и live-метрики из RoomRuntime. Возвращается только хуком `requireAdmin`.
 */
export interface AdminRoomSummary {
  id: string;
  slug: string;
  name: string;
  isPrivate: boolean;
  allowGuests: boolean;
  hostOnlyControl: boolean;
  maxParticipants: number;
  ownerId: string;
  ownerUsername: string;
  ownerEmail: string | null;
  createdAt: string;
  /** Текущее число живых сессий из RoomRuntime (без shadow). 0 если рантайма нет. */
  liveParticipants: number;
  /** Запущен ли рантайм в памяти. */
  isActive: boolean;
  videoUrl: string | null;
}

export interface InviteLink {
  token: string;
  url: string;
  maxUses: number | null;
  uses: number;
  expiresAt: string | null;
  createdAt: string;
}

// ── Voice/video call ────────────────────────────────────────────────────

/** Cap on simultaneous voice participants in one room's call. */
export const CALL_MAX_VOICE = 10;
/** Cap on simultaneous video tracks (a video slot also occupies a voice slot). */
export const CALL_MAX_VIDEO = 4;

export interface CallMember {
  userId: string;
  /** Mic track enabled (false = muted). */
  audio: boolean;
  /** Camera track enabled. */
  video: boolean;
  joinedAt: number;
}

export interface CallSnapshot {
  members: CallMember[];
  /** First member of the current call (null when call is empty). */
  startedByUserId: string | null;
  startedAt: number | null;
}

/** Portable mirror of browser `RTCIceServer` — usable on Node and client. */
export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface RtcConfig {
  iceServers: IceServerConfig[];
}
