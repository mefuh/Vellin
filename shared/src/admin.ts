// ── Admin RBAC + Audit — единый контракт админ-панели v2 ──────────────────
//
// Single source of truth для набора административных прав. И сервер (проверка
// доступа), и клиент (гейтинг навигации/кнопок) импортируют ОТСЮДА. Добавление
// нового права — правка только этого файла: строку в ADMIN_PERMISSIONS и (если
// нужно) в дефолтные наборы системных ролей ниже.

/** Плоский каталог пермишенов вида `<домен>.<действие>`. */
export const ADMIN_PERMISSIONS = [
  'analytics.view',
  'users.view',
  'users.moderate',
  'users.delete',
  'rooms.view',
  'rooms.manage',
  'rooms.delete',
  'moderation.dm.view',
  'reports.view',
  'reports.handle',
  'push.view',
  'push.send',
  'push.templates',
  'media.manage',
  'system.view',
  'jobs.manage',
  'platform.manage',
  'flags.manage',
  'announcements.manage',
  'roles.manage',
  'audit.view',
  'broadcast.send',
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

/** Человекочитаемые названия прав (для UI редактора ролей). */
export const ADMIN_PERMISSION_LABELS: Record<AdminPermission, string> = {
  'analytics.view': 'Аналитика — просмотр',
  'users.view': 'Пользователи — просмотр',
  'users.moderate': 'Пользователи — модерация (блок, сброс, сессии)',
  'users.delete': 'Пользователи — удаление',
  'rooms.view': 'Комнаты — просмотр',
  'rooms.manage': 'Комнаты — управление (правка, закрыть, звонок, вход)',
  'rooms.delete': 'Комнаты — удаление',
  'moderation.dm.view': 'Модерация ЛС — просмотр переписки (чувствительно)',
  'reports.view': 'Жалобы — просмотр очереди',
  'reports.handle': 'Жалобы — решения',
  'push.view': 'Push — дашборд и аналитика',
  'push.send': 'Push — рассылки',
  'push.templates': 'Push — шаблоны',
  'media.manage': 'Медиа-кэш — управление',
  'system.view': 'Система — мониторинг (WS, производительность, health)',
  'jobs.manage': 'Фоновые задачи — управление',
  'platform.manage': 'Платформа — конфигурация и режим обслуживания',
  'flags.manage': 'Feature flags — управление',
  'announcements.manage': 'Объявления — управление',
  'roles.manage': 'Роли и доступ — управление',
  'audit.view': 'Журнал аудита — просмотр',
  'broadcast.send': 'Системное сообщение во все комнаты',
};

/** Группировка прав по доменам — для секций в редакторе ролей. */
export const ADMIN_PERMISSION_GROUPS: { label: string; keys: AdminPermission[] }[] = [
  { label: 'Аналитика', keys: ['analytics.view'] },
  { label: 'Пользователи', keys: ['users.view', 'users.moderate', 'users.delete'] },
  { label: 'Комнаты', keys: ['rooms.view', 'rooms.manage', 'rooms.delete'] },
  { label: 'Модерация', keys: ['moderation.dm.view', 'reports.view', 'reports.handle'] },
  { label: 'Push', keys: ['push.view', 'push.send', 'push.templates', 'broadcast.send'] },
  { label: 'Система', keys: ['system.view', 'jobs.manage', 'media.manage'] },
  { label: 'Платформа', keys: ['platform.manage', 'flags.manage', 'announcements.manage'] },
  { label: 'Доступ', keys: ['roles.manage', 'audit.view'] },
];

/** Стабильные ключи системных ролей. */
export type SystemRoleKey = 'super_admin' | 'administrator' | 'moderator' | 'support' | 'analyst';

/**
 * Дефолтные наборы прав системных ролей. `super_admin` — специальный: имеет ВСЕ
 * права всегда (в т.ч. будущие), поэтому его набор вычисляется как весь каталог.
 * Остальные — редактируемы из UI, здесь лишь стартовый сид.
 */
export const SYSTEM_ROLE_DEFS: Record<
  SystemRoleKey,
  { name: string; description: string; permissions: AdminPermission[] }
> = {
  super_admin: {
    name: 'Super Admin',
    description: 'Полный доступ, включая управление ролями. Неудаляем и непонижаем.',
    permissions: [...ADMIN_PERMISSIONS],
  },
  administrator: {
    name: 'Administrator',
    description: 'Полный доступ, кроме управления ролями.',
    permissions: ADMIN_PERMISSIONS.filter((p) => p !== 'roles.manage'),
  },
  moderator: {
    name: 'Moderator',
    description: 'Модерация пользователей, комнат и жалоб.',
    permissions: [
      'analytics.view',
      'users.view',
      'users.moderate',
      'rooms.view',
      'rooms.manage',
      'reports.view',
      'reports.handle',
      'moderation.dm.view',
      'audit.view',
    ],
  },
  support: {
    name: 'Support',
    description: 'Просмотр пользователей/комнат/жалоб и push-дашборда.',
    permissions: ['users.view', 'rooms.view', 'reports.view', 'push.view'],
  },
  analyst: {
    name: 'Analyst',
    description: 'Только чтение: аналитика и системный мониторинг.',
    permissions: ['analytics.view', 'system.view'],
  },
};

// ── DTO ───────────────────────────────────────────────────────────────────

export interface AdminRoleDTO {
  id: string;
  key: string;
  name: string;
  description: string | null;
  permissions: AdminPermission[];
  isSystem: boolean;
  /** Сколько сотрудников с этой ролью. */
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Ответ `GET /admin/me` — кто я в админке и что мне можно. */
export interface AdminMeResponse {
  userId: string;
  username: string;
  email: string;
  role: AdminRoleDTO | null;
  /** Плоский эффективный набор прав (super_admin → весь каталог). */
  permissions: AdminPermission[];
  isSuperAdmin: boolean;
}

export interface AdminStaffMember {
  id: string;
  publicId: string;
  username: string;
  email: string;
  avatarSeed: string;
  avatarUrl: string | null;
  roleId: string | null;
  roleKey: string | null;
  roleName: string | null;
}

export interface AdminRoleListResponse {
  roles: AdminRoleDTO[];
}
export interface AdminRoleResponse {
  role: AdminRoleDTO;
}
export interface AdminStaffListResponse {
  staff: AdminStaffMember[];
}

export interface CreateRoleRequest {
  name: string;
  description?: string;
  permissions: AdminPermission[];
}
export interface UpdateRoleRequest {
  name?: string;
  description?: string | null;
  permissions?: AdminPermission[];
}
export interface AssignRoleRequest {
  /** null — снять роль (лишить админ-доступа). */
  roleId: string | null;
}

// ── Audit Log ──────────────────────────────────────────────────────────────

export interface AuditLogEntryDTO {
  id: string;
  actorId: string | null;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string | null;
  before: unknown;
  after: unknown;
  meta: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AuditLogQuery {
  q?: string;
  actorId?: string;
  action?: string;
  targetType?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export interface AuditLogListResponse {
  entries: AuditLogEntryDTO[];
  nextCursor: string | null;
}

// ── Аналитика ────────────────────────────────────────────────────────────────

export type AnalyticsRange = '7d' | '30d' | '90d';

/** Точка временного ряда (date = YYYY-MM-DD). */
export interface AnalyticsPoint {
  date: string;
  value: number;
}

export interface AnalyticsSeries {
  points: AnalyticsPoint[];
  total: number;
}

/** Сводка для витринного обзора. */
export interface AnalyticsOverview {
  users: { total: number; online: number; blocked: number; guestsOnline: number; newToday: number; new7d: number };
  rooms: { total: number; active: number; private: number };
  social: { messages: number; dmSent: number; friendships: number };
  sharedWatch: { totalHours: number; sessions: number };
  registrations7d: AnalyticsSeries;
  generatedAt: string;
}

export interface UsersAnalytics {
  registrations: AnalyticsSeries;
  dau: AnalyticsSeries;
  totals: { total: number; blocked: number; online: number; guestsOnline: number; deleted: number };
  /** Активность (входы) по часам суток, 0..23. */
  byHour: { hour: number; value: number }[];
}

export interface AnalyticsTopRoom {
  id: string;
  slug: string;
  name: string;
  messages: number;
  members: number;
  isPrivate: boolean;
}

export interface RoomsAnalytics {
  created: AnalyticsSeries;
  totals: { total: number; active: number; private: number; avgLiveParticipants: number };
  topRooms: AnalyticsTopRoom[];
}

export interface AnalyticsPair {
  userAId: string;
  userAName: string;
  userBId: string;
  userBName: string;
  totalSeconds: number;
  sessionsCount: number;
  longestSessionSeconds: number;
  lastWatchedAt: string | null;
}

export interface SharedWatchAnalytics {
  totals: { totalHours: number; sessions: number; avgSessionMinutes: number; pairs: number };
  topPairs: AnalyticsPair[];
  longestSessions: AnalyticsPair[];
}

export interface SocialAnalytics {
  messages: AnalyticsSeries;
  friendships: AnalyticsSeries;
  totals: {
    messages: number;
    photos: number;
    voice: number;
    video: number;
    invites: number;
    friendships: number;
    blocks: number;
  };
}

// ── Журнал и участники комнаты ───────────────────────────────────────────────

export interface RoomEventDTO {
  id: string;
  type: string;
  actorId: string | null;
  actorName: string | null;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface RoomEventListResponse {
  events: RoomEventDTO[];
  nextCursor: string | null;
}

/** Участник комнаты для админ-управления (объединяет персистентных членов и live). */
export interface AdminRoomMemberDTO {
  userId: string;
  username: string;
  avatarSeed: string;
  avatarUrl: string | null;
  kind: 'user' | 'guest';
  role: 'owner' | 'admin' | 'member' | 'guest';
  /** Сейчас подключён к комнате. */
  isLive: boolean;
  /** Есть персистентная запись членства (можно менять роль). */
  isMember: boolean;
}

export interface AdminRoomMembersResponse {
  members: AdminRoomMemberDTO[];
}

// ── Media-кэш (ResolvedMedia) ────────────────────────────────────────────────

export interface MediaCacheEntry {
  sourceUrl: string;
  kind: string;
  title: string | null;
  mime: string | null;
  durationSec: number | null;
  hasPoster: boolean;
  resolvedAt: string;
  expiresAt: string | null;
}

export interface MediaCacheListResponse {
  entries: MediaCacheEntry[];
  nextCursor: string | null;
  total: number;
}

// ── География ────────────────────────────────────────────────────────────────

export interface GeoBucket {
  name: string;
  count: number;
}

export interface GeoResponse {
  totalUsers: number;
  totalWithCity: number;
  topCities: GeoBucket[];
  topCountries: GeoBucket[];
}

// ── Расширенная push-аналитика ───────────────────────────────────────────────

export interface PushHeatCell {
  hour: number;
  count: number;
}

export interface PushTypeEffectiveness {
  type: string;
  sent: number;
  clicked: number;
  ctr: number;
}

export interface PushAnalyticsResponse {
  windowDays: number;
  totalSent: number;
  totalClicked: number;
  ctr: number;
  byHour: PushHeatCell[];
  byBrowser: { browser: string; sent: number }[];
  byType: PushTypeEffectiveness[];
}

// ── Глобальный поиск (Cmd/K) ─────────────────────────────────────────────────

export interface SearchUserHit {
  id: string;
  publicId: string;
  username: string;
  email: string;
  avatarSeed: string;
  avatarUrl: string | null;
}

export interface SearchRoomHit {
  id: string;
  slug: string;
  name: string;
}

export interface AdminSearchResponse {
  users: SearchUserHit[];
  rooms: SearchRoomHit[];
}

// ── Системный мониторинг ─────────────────────────────────────────────────────

export interface WsRoomStat {
  roomId: string;
  slug: string;
  name: string;
  participants: number;
}

export interface RecentError {
  ts: string;
  where: string;
  message: string;
}

export interface WsSnapshot {
  connections: number;
  distinctUsers: number;
  online: number;
  watchers: number;
  librarySubs: number;
  roomSessions: number;
  activeRooms: number;
  rooms: WsRoomStat[];
  eventTotal: number;
  eventPerSec: number;
  recentErrors: RecentError[];
}

export interface PerfRouteStat {
  route: string;
  count: number;
  avgMs: number;
  maxMs: number;
}

export interface PerfSnapshot {
  uptimeSec: number;
  memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number; externalMb: number };
  cpuPercent: number;
  requests: { last1m: number; rps: number; errorRate: number; avgMs: number; p95Ms: number };
  slowest: { route: string; ms: number; status: number; ts: string }[];
  byRoute: PerfRouteStat[];
  recentErrors: RecentError[];
}

export type HealthStatus = 'ok' | 'degraded' | 'down' | 'disabled';

export interface HealthCheck {
  name: string;
  status: HealthStatus;
  latencyMs: number | null;
  detail: string | null;
}

export interface HealthSnapshot {
  overall: HealthStatus;
  checks: HealthCheck[];
  serverTime: string;
}

export interface SystemJobDTO {
  id: string;
  kind: 'push' | 'transcode';
  status: string;
  attempts: number;
  maxAttempts: number;
  label: string;
  nextAttemptAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface SystemJobsResponse {
  push: { counts: Record<string, number>; jobs: SystemJobDTO[] };
  transcode: { processing: number; jobs: SystemJobDTO[] };
}

// ── Управление платформой ────────────────────────────────────────────────────

/** Тумблеры функциональности (enforce на сервере при соответствующих действиях). */
export interface PlatformToggles {
  registration: boolean;
  guests: boolean;
  roomCreation: boolean;
  uploads: boolean;
}

export interface PlatformMaintenance {
  enabled: boolean;
  message: string;
}

/** Числовые лимиты платформы (значения по умолчанию — в platform/config.ts). */
export interface PlatformLimits {
  maxRoomParticipants: number;
  avatarMaxMb: number;
  dmImageMaxMb: number;
  dmVoiceMaxMb: number;
  dmVideoMaxMb: number;
}

export interface PlatformSettingsDTO {
  toggles: PlatformToggles;
  maintenance: PlatformMaintenance;
  limits: PlatformLimits;
}

export interface PlatformSettingsResponse {
  settings: PlatformSettingsDTO;
}

export interface UpdatePlatformSettingsRequest {
  toggles?: Partial<PlatformToggles>;
  maintenance?: Partial<PlatformMaintenance>;
  limits?: Partial<PlatformLimits>;
}

// ── Feature flags ────────────────────────────────────────────────────────────

export interface FeatureFlagDTO {
  key: string;
  enabled: boolean;
  description: string | null;
  updatedAt: string;
}

export interface FeatureFlagListResponse {
  flags: FeatureFlagDTO[];
}

export interface UpsertFeatureFlagRequest {
  key: string;
  enabled: boolean;
  description?: string | null;
}

// ── Объявления ───────────────────────────────────────────────────────────────

export type AnnouncementKind = 'banner' | 'modal' | 'news';
export type AnnouncementStyle = 'info' | 'accent' | 'warn';
export type AnnouncementAudienceKind = 'all' | 'role' | 'new-users';

export interface AnnouncementAudience {
  kind: AnnouncementAudienceKind;
  /** Для kind='role' — ключ роли. 'new-users' = аккаунты младше 7 дней. */
  role?: string;
}

export interface AnnouncementDTO {
  id: string;
  kind: AnnouncementKind;
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  style: AnnouncementStyle;
  audience: AnnouncementAudience;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
}

export interface AnnouncementListResponse {
  announcements: AnnouncementDTO[];
}

export interface UpsertAnnouncementRequest {
  kind: AnnouncementKind;
  title: string;
  body: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  style?: AnnouncementStyle;
  audience?: AnnouncementAudience;
  active?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
}

// ── Публичный runtime-конфиг (GET /api/runtime) ──────────────────────────────

export interface RuntimeAnnouncement {
  id: string;
  kind: AnnouncementKind;
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  style: AnnouncementStyle;
}

/**
 * Публичный снапшот конфигурации для клиента: режим обслуживания, тумблеры (для
 * скрытия/блокировки UI), включённые флаги и активные объявления для зрителя.
 */
export interface RuntimeConfig {
  maintenance: PlatformMaintenance;
  toggles: PlatformToggles;
  flags: string[];
  announcements: RuntimeAnnouncement[];
}

// ── Жалобы (Reports) ─────────────────────────────────────────────────────────

export type ReportTargetType = 'message' | 'user' | 'room' | 'image' | 'video' | 'dm';
export type ReportReason = 'spam' | 'harassment' | 'nsfw' | 'illegal' | 'other';
export type ReportStatus = 'open' | 'reviewing' | 'accepted' | 'rejected';

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: 'Спам',
  harassment: 'Оскорбления / травля',
  nsfw: 'Непристойный контент',
  illegal: 'Противозаконное',
  other: 'Другое',
};

/** Запрос пользователя на подачу жалобы. */
export interface CreateReportRequest {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  comment?: string;
}

export interface ReportDTO {
  id: string;
  reporterId: string | null;
  reporterName: string | null;
  targetType: ReportTargetType;
  targetId: string;
  targetUserId: string | null;
  targetLabel: string | null;
  reason: ReportReason;
  comment: string | null;
  snapshot: Record<string, unknown>;
  status: ReportStatus;
  handledByEmail: string | null;
  handledAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
}

export interface ReportListResponse {
  reports: ReportDTO[];
  nextCursor: string | null;
  openCount: number;
}

/** Решение по жалобе. При accept можно заблокировать/предупредить нарушителя. */
export interface ResolveReportRequest {
  decision: 'accept' | 'reject';
  block?: boolean;
  warn?: boolean;
  note?: string;
}

// ── Модерация ЛС ─────────────────────────────────────────────────────────────

export interface ModConversationDTO {
  id: string;
  userA: PublicUserRef;
  userB: PublicUserRef;
  lastMessageAt: string;
  messageCount: number;
}

export interface ModConversationListResponse {
  conversations: ModConversationDTO[];
  nextCursor: string | null;
  /** Включён ли раздел глобально (env DM_MODERATION_ENABLED). */
  enabled: boolean;
}

export interface ModMessageDTO {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  imageUrl: string | null;
  voiceUrl: string | null;
  videoUrl: string | null;
  videoStatus: string | null;
  inviteRoomName: string | null;
  createdAt: string;
}

export interface ModMessagesResponse {
  conversationId: string;
  userA: PublicUserRef;
  userB: PublicUserRef;
  messages: ModMessageDTO[];
  nextCursor: string | null;
}

// ── Модерация пользователей / Профиль-360 ────────────────────────────────────

/** Расширенный профиль пользователя для админ-карточки. */
export interface AdminUserProfile {
  id: string;
  publicId: string;
  email: string;
  username: string;
  avatarSeed: string;
  avatarUrl: string | null;
  bio: string | null;
  gender: string | null;
  birthDate: string | null;
  city: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  isBlocked: boolean;
  blockedAt: string | null;
  blockReason: string | null;
  /** Административная роль пользователя (если он сотрудник). */
  roleName: string | null;
}

export interface AdminUserStats {
  friends: number;
  roomsOwned: number;
  messagesSent: number;
  dmSent: number;
  devices: number;
  pushDevices: number;
}

/** Совместное время с одним из партнёров (для секции в профиле-360). */
export interface AdminSharedWatchPeer {
  peer: PublicUserRef;
  totalSeconds: number;
  sessionsCount: number;
  longestSessionSeconds: number;
  lastWatchedAt: string | null;
}

/** Лёгкая ссылка на пользователя (без импорта domain в этот модуль). */
export interface PublicUserRef {
  id: string;
  publicId: string;
  username: string;
  avatarSeed: string;
  avatarUrl: string | null;
}

/** Мета последнего сообщения пользователя в комнате (для профиля-360). */
export interface AdminUserMessageMeta {
  id: string;
  roomSlug: string;
  roomName: string;
  body: string;
  createdAt: string;
}

/** Push-устройство пользователя (админ-вид). */
export interface AdminPushDevice {
  id: string;
  browser: string;
  os: string;
  deviceLabel: string;
  active: boolean;
  createdAt: string;
  lastUsedAt: string;
}

/** Сессия/устройство пользователя (админ-вид). */
export interface AdminUserSession {
  id: string;
  deviceLabel: string;
  browser: string;
  os: string;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
}

/** Полный агрегированный ответ профиля-360. */
export interface AdminUserFullResponse {
  user: AdminUserProfile;
  stats: AdminUserStats;
  friends: PublicUserRef[];
  friendsTotal: number;
  sharedWatch: AdminSharedWatchPeer[];
  favorites: AdminFavoriteTitle[];
  rooms: AdminUserRoomRef[];
  recentMessages: AdminUserMessageMeta[];
  sessions: AdminUserSession[];
  pushDevices: AdminPushDevice[];
  history: AuditLogEntryDTO[];
}

/** Избранный фильм (снимок из профиля пользователя). */
export interface AdminFavoriteTitle {
  kpId: number;
  title: string;
  year: number | null;
  posterUrl: string | null;
  ratingKp: number | null;
}

/** Комната, которой владеет пользователь (админ-вид). */
export interface AdminUserRoomRef {
  id: string;
  slug: string;
  name: string;
  isPrivate: boolean;
  createdAt: string;
}

export interface AdminUserSessionsResponse {
  sessions: AdminUserSession[];
}

// ── Редактирование профиля пользователя администратором ──────────────────────

/**
 * Патч редактируемых полей профиля. Все поля опциональны — отправляется только
 * то, что меняется. `null` очищает поле (город/пол/дата рождения), email —
 * непустая строка. Пропущенные ключи не трогаются.
 */
export interface AdminUserProfilePatch {
  email?: string;
  city?: string | null;
  gender?: 'male' | 'female' | 'other' | null;
  /** YYYY-MM-DD или null для очистки. */
  birthDate?: string | null;
}

export interface AdminUpdateUserProfileResponse {
  user: AdminUserProfile;
}

/** Ответ на операции с избранным (актуальный порядок после изменения). */
export interface AdminFavoritesResponse {
  favorites: AdminFavoriteTitle[];
}

/** Новый порядок избранного — массив kpId в желаемой последовательности. */
export interface AdminFavoritesReorderRequest {
  order: number[];
}

/** Начисление/списание совместного времени: знак задаёт направление. */
export interface AdminSharedTimeAdjustRequest {
  deltaSeconds: number;
}

/** Актуальные агрегаты пары после изменения совместного времени. */
export interface AdminSharedTimeResponse {
  totalSeconds: number;
  sessionsCount: number;
  longestSessionSeconds: number;
}

/** Различимые действия в аудите (не исчерпывающе — строка расширяема). */
export type AuditAction =
  | 'user.block'
  | 'user.unblock'
  | 'user.delete'
  | 'user.reset_avatar'
  | 'user.reset_bio'
  | 'user.reset_favorites'
  | 'user.edit_profile'
  | 'user.favorite_remove'
  | 'user.favorites_reorder'
  | 'user.shared_time_adjust'
  | 'user.shared_time_reset'
  | 'user.push_disable'
  | 'user.session_revoke'
  | 'user.sessions_revoke_all'
  | 'room.update'
  | 'room.delete'
  | 'room.close'
  | 'room.call_end'
  | 'room.access_ticket'
  | 'broadcast.send'
  | 'push.template_update'
  | 'push.broadcast'
  | 'role.create'
  | 'role.update'
  | 'role.delete'
  | 'staff.assign_role'
  | 'dm.view'
  | 'report.resolve'
  | 'platform.update'
  | 'flag.update'
  | 'announcement.update'
  | 'media.purge';
