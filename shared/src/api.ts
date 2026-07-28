import type {
  AdminRoomSummary,
  AppNotification,
  AuthUser,
  DeviceSession,
  FavoriteTitle,
  FriendRequest,
  FriendUser,
  Gender,
  ParticipantInfo,
  PrivacySettings,
  PublicProfile,
  RoomDetails,
  RoomSummary,
  ChatMessage,
  InviteLink,
  ResolvedMedia,
  RoomPermissions,
  RoomRole,
  DmConversation,
  DirectMessageDTO,
  DmEligibility,
  PublicUser,
} from './domain.js';
import type { PlatformToggles, PlatformMaintenance, PlatformLimits } from './admin.js';

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
  /** Пол: значение — установить, `null` — очистить, не передавать — не менять. */
  gender?: Gender | null;
  /** Дата рождения `YYYY-MM-DD`: значение — установить, `null` — очистить. */
  birthDate?: string | null;
  /** Город: значение — установить, `null`/пусто — очистить. */
  city?: string | null;
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

// ── Приватность ───────────────────────────────────────────────────────────
export interface PrivacyResponse {
  privacy: PrivacySettings;
}
export interface UpdatePrivacyRequest {
  privacy: PrivacySettings;
}
export type UpdatePrivacyResponse = PrivacyResponse;

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

// ── Вход по QR-коду (десктоп-клиент) ─────────────────────────────────────
//
// Десктоп-клиент просит заявку и показывает QR со ссылкой на сайт. Владелец
// аккаунта открывает ссылку телефоном (камерой или сканером в «Устройствах»)
// и подтверждает вход — клиент получает токен опросом.
//
// Секретов два намеренно: `requestId` попадает в QR и виден всем, кто увидел
// экран, а забрать выданный токен можно только по `pollToken`, который знает
// исключительно запросивший клиент.

/** Ответ на запрос заявки: что показать в QR и чем опрашивать статус. */
export interface QrLoginStartResponse {
  /** Идентификатор заявки — он же зашит в ссылку QR. */
  requestId: string;
  /** Секрет для опроса статуса. Не показывать в QR. */
  pollToken: string;
  /** Адрес для QR: https://<сайт>/link/<requestId>. */
  url: string;
  /** Когда заявка сгорит (ISO). */
  expiresAt: string;
}

export type QrLoginStatus = 'pending' | 'approved' | 'expired';

/** Опрос статуса заявки клиентом. Токен отдаётся один раз, после — expired. */
export interface QrLoginPollResponse {
  status: QrLoginStatus;
  /** Заполняются только при status === 'approved'. */
  token?: string;
  user?: AuthUser;
}

/** Данные заявки для страницы подтверждения на сайте. */
export interface QrLoginRequestInfo {
  requestId: string;
  status: QrLoginStatus;
  createdAt: string;
  expiresAt: string;
  /** Откуда пришла заявка — показываем владельцу перед подтверждением. */
  ip: string | null;
  userAgent: string | null;
}

export interface ApproveQrLoginResponse {
  status: QrLoginStatus;
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

/** Ответ на карточку-приглашение в комнату: принять или отклонить. */
export interface RoomInviteRespondRequest {
  action: 'accept' | 'decline';
}
export type RoomInviteRespondResponse =
  | { ok: true; redirect?: { slug: string; inviteToken: string } }
  | { ok: false; reason: 'expired' | 'full' | 'closed' | 'gone'; message: string };

/** Живая инфо-сводка комнаты для попапа по тапу на карточку-приглашение. */
export interface RoomInviteInfoResponse {
  roomName: string;
  videoTitle: string | null;
  videoPoster: string | null;
  ownerUsername: string;
  participantCount: number;
  maxParticipants: number;
  /** Комната ещё существует (false — закрыта/удалена). */
  available: boolean;
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
/** Ответ на удаление одного уведомления (по id). */
export interface DismissNotificationResponse {
  unreadCount: number;
}

// ── Личные сообщения (REST) ──────────────────────────────────────────────
export interface ListConversationsResponse {
  conversations: DmConversation[];
  /** Суммарно непрочитанных ЛС по всем диалогам — для бейджа в навбаре. */
  unreadTotal: number;
}
/** Тред переписки с одним собеседником (последняя страница сообщений). */
export interface ConversationThreadResponse {
  /** Пусто, если диалога ещё нет (создастся при первой отправке). */
  conversationId: string;
  peer: PublicUser;
  /** Сообщения по возрастанию времени (старые → новые). */
  messages: DirectMessageDTO[];
  /** Есть ещё более старые сообщения (для подгрузки «раньше»). */
  hasMore: boolean;
  /** Когда собеседник прочитал переписку — для галочек. Null — не читал. */
  peerLastReadAt: string | null;
  online: boolean;
  /** Время последнего захода собеседника (ISO, с учётом приватности). Null — онлайн/скрыто. */
  peerLastSeenAt: string | null;
  /** Пол собеседника (для грамматики «был/была»), с учётом приватности. */
  peerGender: Gender | null;
  eligibility: DmEligibility;
}

/** Ответ на загрузку изображения для ЛС (multipart). */
export interface UploadDmImageResponse {
  /** Публичный URL сохранённого изображения (`/api/uploads/dm/...`). */
  url: string;
  width: number;
  height: number;
}

/** Ответ на загрузку голосового сообщения для ЛС (multipart). */
export interface UploadDmVoiceResponse {
  /** Публичный URL сохранённого аудио (`/api/uploads/dm-voice/...`). */
  url: string;
}

// ── Realtime (пользовательский WS-канал) ─────────────────────────────────
export interface RealtimeTicketResponse {
  ticket: string;
}

// ── Любимые фильмы/сериалы (kinopoisk.dev) ───────────────────────────────
/** Результаты поиска по kinopoisk.dev для выбора в избранное. */
export interface SearchTitlesResponse {
  titles: FavoriteTitle[];
}
/** Текущее избранное пользователя (до 5, по порядку). */
export interface FavoriteTitlesResponse {
  titles: FavoriteTitle[];
}
/** Полная замена набора избранного (клиент шлёт снимки из поиска, ≤5). */
export interface UpdateFavoriteTitlesRequest {
  titles: FavoriteTitle[];
}

// ── Геосправочник (города) ───────────────────────────────────────────────
export interface SearchCitiesResponse {
  /**
   * Готовые подписи вида «Moscow, Россия» — клиент показывает их в выпадающем
   * списке и сохраняет выбранную строкой в поле города. Сервер при сохранении
   * профиля проверяет, что значение принадлежит этому справочнику.
   */
  cities: string[];
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
  /** Публичный id для ссылки на профиль (`/u/:publicId`). */
  publicId: string;
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
  /** Название админ-роли, если пользователь — сотрудник (иначе null). */
  roleName: string | null;
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

// ── App config / discovery ────────────────────────────────────────────────

/** Платформы клиента для версионного гейтинга и дискавери. */
export type ClientPlatform = 'web' | 'windows' | 'macos' | 'ios' | 'android';

/**
 * Минимально поддерживаемая версия клиента по каждой платформе. Пустая строка
 * ('') означает «гейтинг выключен» — любая версия допустима.
 */
export type MinClientVersions = Record<ClientPlatform, string>;

/**
 * Публичный конфиг сервиса (`GET /api/config`) — единая точка дискавери для
 * нативных клиентов. Не требует авторизации. Отдаёт версию API, минимально
 * поддерживаемые версии приложений (force-update), абсолютные базовые адреса
 * (REST/WS/загрузки), актуальные фиче-тумблеры и режим push.
 */
export interface AppConfigResponse {
  /** Версия серверного API (из package.json). */
  version: string;
  /** Минимальные версии клиентов для допуска (force-update). */
  minVersions: MinClientVersions;
  /** Абсолютные базовые адреса. Пустая строка — использовать origin запроса. */
  endpoints: {
    /** База REST API, напр. `https://vellin.ru/api`. */
    apiBaseUrl: string;
    /** База отдачи загруженных файлов (обычно совпадает с origin). */
    uploadsBaseUrl: string;
    /** WS-адрес комнат, напр. `wss://vellin.ru/ws`. */
    wsRoomUrl: string;
    /** WS-адрес пользовательского канала, напр. `wss://vellin.ru/ws/user`. */
    wsUserUrl: string;
  };
  /** Актуальные тумблеры доступности функций (для скрытия недоступного UI). */
  features: PlatformToggles;
  /** Режим обслуживания — клиент показывает заглушку. */
  maintenance: PlatformMaintenance;
  /** Лимиты загрузок (МБ) — клиент валидирует до отправки. */
  limits: PlatformLimits;
  /** Push-слой: сейчас только web-push; vapidPublicKey=null → push выключен. */
  push: {
    mode: 'webpush';
    vapidPublicKey: string | null;
  };
  /**
   * Данные автообновления десктоп-клиентов. Для каждой платформы — последняя
   * доступная версия и URL установщика; null — обновление не опубликовано.
   * Клиент сравнивает latestVersion со своей и предлагает обновиться.
   */
  update: {
    windows: DesktopUpdate | null;
  };
  /**
   * Видна ли запросившему страница скачивания Windows-клиента. Сервер уже
   * применил тумблер и аудиторию из админ-панели (учитывая Bearer-токен, если
   * он был прислан), поэтому веб-клиенту остаётся только показать или
   * полностью спрятать страницу и все ссылки на неё.
   */
  windowsDownloadVisible: boolean;
}

/** Публикация обновления десктоп-клиента: версия + URL установщика. */
export interface DesktopUpdate {
  latestVersion: string;
  /** Абсолютный URL установщика (напр. https://vellin.ru/winapp/Vellin-Setup-1.2.0.exe). */
  url: string;
  /** Обязательное обновление — клиент не даёт продолжить без установки. */
  mandatory: boolean;
}

/**
 * Ответ при устаревшем клиенте (HTTP 426 Upgrade Required). Приложение по этому
 * маркеру показывает экран принудительного обновления.
 */
export interface UpgradeRequiredResponse extends ApiError {
  error: 'UpgradeRequired';
  /** Минимальная требуемая версия для платформы клиента. */
  minVersion: string;
  /** Платформа, для которой сработал гейтинг. */
  platform: ClientPlatform;
}

// ── Errors ──────────────────────────────────────────────────────────────
export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}
