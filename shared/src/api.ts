import type {
  AuthUser,
  RoomDetails,
  RoomSummary,
  ChatMessage,
  InviteLink,
  ResolvedMedia,
  RoomPermissions,
  RoomRole,
} from './domain.js';

// ── Auth ────────────────────────────────────────────────────────────────
export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
}
export interface LoginRequest {
  email: string;
  password: string;
}
export interface GuestRequest {
  username: string;
}
export interface AuthResponse {
  token: string;
  user: AuthUser;
}
export interface MeResponse {
  user: AuthUser;
}

// ── Rooms ───────────────────────────────────────────────────────────────
export interface CreateRoomRequest {
  name: string;
  isPrivate: boolean;
  password?: string;
  maxParticipants?: number;
  allowGuests?: boolean;
  hostOnlyControl?: boolean;
  videoUrl?: string;
}
export interface CreateRoomResponse {
  room: RoomDetails;
}
export interface ListRoomsResponse {
  rooms: RoomSummary[];
}
export interface GetRoomResponse {
  room: RoomDetails;
}
export interface JoinRoomRequest {
  slug: string;
  password?: string;
  inviteToken?: string;
}
export interface JoinRoomResponse {
  room: RoomDetails;
  wsTicket: string;
}
export interface SetVideoUrlRequest {
  url: string;
}
export interface SetVideoUrlResponse {
  room: RoomDetails;
}
export interface ResolveRequest {
  url: string;
}
export type ResolveResponse = ResolvedMedia;

// ── Invites ─────────────────────────────────────────────────────────────
export interface CreateInviteRequest {
  maxUses?: number;
  expiresAt?: string;
}
export interface CreateInviteResponse {
  link: InviteLink;
}

// ── Members ─────────────────────────────────────────────────────────────
export interface UpdateMemberRoleRequest {
  role: 'admin' | 'member';
}
export interface UpdateMemberRoleResponse {
  userId: string;
  role: RoomRole;
  permissions: RoomPermissions;
}
export interface UpdateMemberPermissionsRequest {
  permissions: Partial<RoomPermissions>;
}
export interface UpdateMemberPermissionsResponse {
  userId: string;
  role: RoomRole;
  permissions: RoomPermissions;
}
export interface KickMemberResponse {
  userId: string;
}

// ── Chat ────────────────────────────────────────────────────────────────
export interface MessagesResponse {
  messages: ChatMessage[];
  nextCursor: string | null;
}

// ── Errors ──────────────────────────────────────────────────────────────
export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}
