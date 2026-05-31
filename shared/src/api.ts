import type {
  AdminRoomSummary,
  AppNotification,
  AuthUser,
  DeviceSession,
  FriendRequest,
  FriendUser,
  ParticipantInfo,
  PublicProfile,
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
  /**
   * Присутствует только когда сервер «подхватил» легаси-токен без серверной
   * сессии: создал Session и перевыпустил токен с `sid`. Клиент должен
   * сохранить его вместо текущего.
   */
  token?: string;
}

// ── Профиль (редактирование своего аккаунта) ─────────────────────────────
export interface UpdateProfileRequest {
  username?: string;
  bio?: string | null;
  /**
   * Управление аватаром-градиентом:
   * - строка — установить конкретный seed (перегенерация),
   * - `null` — сбросить на новый случайный seed,
   * - не передавать — оставить как есть.
   * В любом случае при заданном поле загруженная картинка (`avatarUrl`)
   * сбрасывается в null.
   */
  avatarSeed?: string | null;
}
/** Общий ответ профильных мутаций: свежий токен (тот же `sid`) + пользователь. */
export interface ProfileMutationResponse {
  token: string;
  user: AuthUser;
}
export type UpdateProfileResponse = ProfileMutationResponse;
export type UploadAvatarResponse = ProfileMutationResponse;

export interface ChangeEmailRequest {
  email: string;
  currentPassword: string;
}
export type ChangeEmailResponse = ProfileMutationResponse;

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}
export type ChangePasswordResponse = ProfileMutationResponse;

// ── Сессии/устройства ────────────────────────────────────────────────────
export interface ListSessionsResponse {
  sessions: DeviceSession[];
}
export interface RevokeSessionResponse {
  id: string;
}
export interface RevokeOtherSessionsResponse {
  /** Сколько сессий было завершено. */
  revoked: number;
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
/** Пригласить существующего друга в комнату (уведомление + ссылка). */
export interface InviteFriendRequest {
  friendId: string;
}
export interface InviteFriendResponse {
  ok: true;
}

// ── Друзья ──────────────────────────────────────────────────────────────
export interface ListFriendsResponse {
  friends: FriendUser[];
}
export interface ListFriendRequestsResponse {
  requests: FriendRequest[];
}
export interface SendFriendRequestRequest {
  /** Один из двух способов адресации заявки. */
  username?: string;
  userId?: string;
}
export interface SendFriendRequestResponse {
  request: FriendRequest;
  /** Если встречная заявка существовала — она сразу принята. */
  autoAccepted: boolean;
}
export interface RespondFriendRequestResponse {
  status: 'accepted' | 'declined';
}
export interface RemoveFriendResponse {
  userId: string;
}
export interface BlockFriendResponse {
  userId: string;
}

// ── Пользователи (поиск + публичный профиль) ─────────────────────────────
export interface SearchUsersResponse {
  users: PublicProfile[];
}
export interface GetPublicProfileResponse {
  profile: PublicProfile;
}

// ── Уведомления ─────────────────────────────────────────────────────────
export interface ListNotificationsResponse {
  notifications: AppNotification[];
  unreadCount: number;
}
export interface MarkNotificationsReadRequest {
  /** Конкретные id; без поля — отметить все. */
  ids?: string[];
}
export interface MarkNotificationsReadResponse {
  unreadCount: number;
}

// ── Realtime (пользовательский WS-канал) ─────────────────────────────────
export interface RealtimeTicketResponse {
  ticket: string;
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

// ── Admin ───────────────────────────────────────────────────────────────

export interface AdminStatsResponse {
  users: {
    total: number;
    blocked: number;
    /** Сколько уникальных userId сейчас имеют живую WS-сессию (без shadow). */
    online: number;
  };
  rooms: {
    total: number;
    /** Сколько комнат сейчас активны в памяти (есть RoomRuntime). */
    active: number;
    private: number;
  };
  /** ISO-метка момента сбора статистики — для UI. */
  serverTime: string;
}

export interface AdminUserSummary {
  id: string;
  email: string;
  username: string;
  avatarSeed: string;
  avatarUrl: string | null;
  createdAt: string;
  isBlocked: boolean;
  blockedAt: string | null;
  blockReason: string | null;
  /** Сколько комнат пользователь владеет. */
  roomsOwned: number;
}

export interface AdminUserListResponse {
  users: AdminUserSummary[];
  nextCursor: string | null;
}

export interface AdminUserDetailResponse {
  user: AdminUserSummary;
  rooms: RoomSummary[];
}

export interface BlockUserRequest {
  reason?: string;
}

export interface BlockUserResponse {
  user: AdminUserSummary;
}

export interface AdminRoomListResponse {
  rooms: AdminRoomSummary[];
  nextCursor: string | null;
}

export interface AdminRoomDetailResponse {
  room: AdminRoomSummary;
  /** Полная информация о комнате включая видео-состояние. */
  details: RoomDetails;
  /** Живые участники из RoomRuntime (без shadow). Пусто если рантайма нет. */
  participants: ParticipantInfo[];
}

export interface UpdateRoomRequest {
  name?: string;
  isPrivate?: boolean;
  /**
   * Управление паролем:
   * - `string` (>=4 chars) — установить новый пароль (хеш на сервере)
   * - `null` — сбросить пароль (комната становится без пароля)
   * - не передавать поле — оставить как есть
   */
  password?: string | null;
  maxParticipants?: number;
  allowGuests?: boolean;
  hostOnlyControl?: boolean;
}

export interface UpdateRoomResponse {
  room: AdminRoomSummary;
  details: RoomDetails;
}

export type AdminAccessMode = 'normal' | 'shadow';

export interface AdminAccessTicketRequest {
  mode: AdminAccessMode;
}

export interface AdminAccessTicketResponse {
  room: RoomDetails;
  wsTicket: string;
  mode: AdminAccessMode;
}

export interface AdminBroadcastRequest {
  body: string;
}

export interface AdminBroadcastResponse {
  /** Сколько активных комнат получили сообщение. */
  roomsDelivered: number;
}

export interface AdminCloseRoomResponse {
  roomId: string;
  /** Сколько участников было выкинуто. */
  kicked: number;
}

// ── Errors ──────────────────────────────────────────────────────────────
export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}
