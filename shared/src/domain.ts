export type UserKind = 'user' | 'guest';

/** Пол пользователя для профиля. Хранится опционально (может быть null). */
export type Gender = 'male' | 'female' | 'other';

export interface PublicUser {
  id: string;
  username: string;
  avatarSeed: string;
  /**
   * URL загруженного аватара (`/api/uploads/avatars/...`). Null — у пользователя
   * нет своей картинки, аватар рисуется как градиент по `avatarSeed`.
   */
  avatarUrl: string | null;
  kind: UserKind;
}

/**
 * Любимый фильм/сериал в профиле — снимок данных из kinopoisk.dev на момент
 * выбора. Одинаково используется в результатах поиска и в избранном.
 */
export interface FavoriteTitle {
  /** Id в Кинопоиске. */
  kpId: number;
  /** Тип: 'movie' | 'tv-series' | 'cartoon' | 'anime' | ... (сырой из КП). */
  type: string;
  /** Русское название. */
  title: string;
  /** Оригинальное название. Null — совпадает/отсутствует. */
  originalTitle: string | null;
  year: number | null;
  /** URL постера (CDN Кинопоиска). Null — нет постера. */
  posterUrl: string | null;
  /** Рейтинг Кинопоиска (0–10). Null — нет. */
  ratingKp: number | null;
  /** Рейтинг IMDb (0–10). Null — нет. */
  ratingImdb: number | null;
}

// ── Приватность (телеграм-стиль) ─────────────────────────────────────────

/** Кому доступна категория данных профиля. */
export type PrivacyVisibility = 'everyone' | 'friends' | 'nobody';

/** Категории приватности профиля. */
export type PrivacyCategory = 'online' | 'friends' | 'personalInfo' | 'favorites';

/**
 * Правило видимости одной категории. `allow`/`deny` — точечные исключения по
 * userId поверх базового правила: `deny` перекрывает всё, `allow` перекрывает
 * 'friends'/'nobody'.
 */
export interface PrivacyRule {
  visibility: PrivacyVisibility;
  /** Кому видно ВСЕГДА (даже при 'nobody'/'friends'). */
  allow: string[];
  /** Кому скрыто ВСЕГДА (перекрывает всё остальное). */
  deny: string[];
}

export type PrivacySettings = Record<PrivacyCategory, PrivacyRule>;

export const PRIVACY_CATEGORIES: readonly PrivacyCategory[] = [
  'online',
  'friends',
  'personalInfo',
  'favorites',
];

/** Базовое правило по умолчанию — всё видно всем (текущее поведение сервиса). */
export const DEFAULT_PRIVACY_RULE: PrivacyRule = { visibility: 'everyone', allow: [], deny: [] };

/** Дефолтные настройки приватности (каждая категория — «видно всем»). */
export function defaultPrivacySettings(): PrivacySettings {
  return {
    online: { visibility: 'everyone', allow: [], deny: [] },
    friends: { visibility: 'everyone', allow: [], deny: [] },
    personalInfo: { visibility: 'everyone', allow: [], deny: [] },
    favorites: { visibility: 'everyone', allow: [], deny: [] },
  };
}

export interface AuthUser extends PublicUser {
  email: string | null;
  /** Произвольный текст «О себе». Null — не задан. */
  bio: string | null;
  /** Пол. Null — не указан. */
  gender: Gender | null;
  /** Дата рождения в формате `YYYY-MM-DD`. Null — не указана. */
  birthDate: string | null;
  /** Город. Null — не указан. */
  city: string | null;
  createdAt: string;
  /** True only for the single user whose email matches ADMIN_EMAIL on the server. */
  isAdmin: boolean;
}

/**
 * Устройство/сессия пользователя для страницы профиля. Одна строка `Session`
 * в БД = один вход (браузер/устройство). `current` — это та сессия, чьим
 * токеном сделан текущий запрос `GET /auth/sessions`.
 */
export interface DeviceSession {
  id: string;
  /** Человекочитаемая метка, например «Chrome на Windows». */
  deviceLabel: string;
  browser: string;
  os: string;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
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
  /**
   * Постер/превью играющего сейчас видео — для карточки в библиотеке. Null,
   * если видео не задано или у источника нет обложки (тогда рисуем пейзаж).
   */
  videoPoster: string | null;
  /** Название играющего видео для карточки. Null — нет видео/без имени. */
  videoTitle: string | null;
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

/** Один отстающий/рассинхронизированный участник (для информера синхронизации). */
export interface SyncLaggard {
  userId: string;
  username: string;
  /** Дрифт относительно общей точки, сек (положительный = отстаёт). */
  driftSec: number;
  buffering: boolean;
}

/**
 * Снимок состояния синхронизации комнаты — что показывать в информере плеера.
 * Вычисляется сервером из репортов клиентов; рассылается при смене состояния.
 */
export interface SyncStatus {
  /** Есть устойчивый рассинхрон (с гистерезисом). */
  desynced: boolean;
  reason: 'none' | 'drift' | 'buffering';
  laggards: SyncLaggard[];
  /** Худший абсолютный дрифт по комнате, сек. */
  worstDriftSec: number;
  /** Включена ли хостом авто-синхронизация. */
  autoSync: boolean;
  /** Сейчас идёт «ожидание отстающих» (комната на авто-паузе). */
  waiting: boolean;
  serverTs: number;
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
  avatarUrl: string | null;
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
  avatarUrl: string | null;
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

// ── Друзья / уведомления / присутствие ───────────────────────────────────

/** Краткая ссылка на комнату для presence/инвайтов. */
export interface RoomRef {
  slug: string;
  name: string;
}

/**
 * Принятый друг для списка «Друзья». Помимо публичных полей несёт id записи
 * дружбы (для удаления) и live-присутствие из UserHub.
 */
export interface FriendUser extends PublicUser {
  friendshipId: string;
  online: boolean;
  /** Комната, которую друг смотрит прямо сейчас, либо null. */
  currentRoom: RoomRef | null;
  /** ISO-время последнего захода. Null, если онлайн или неизвестно. */
  lastSeenAt: string | null;
}

/** Pending-заявка в друзья (входящая или исходящая). */
export interface FriendRequest {
  id: string;
  direction: 'incoming' | 'outgoing';
  user: PublicUser;
  createdAt: string;
}

/**
 * Отношение текущего пользователя к просматриваемому профилю.
 * - `self` — это сам пользователь,
 * - `friends` — уже друзья,
 * - `incoming` — он прислал заявку мне (могу принять),
 * - `outgoing` — я прислал заявку ему,
 * - `blocked` — я его заблокировал,
 * - `none` — никакой связи.
 */
export type Relationship = 'none' | 'friends' | 'incoming' | 'outgoing' | 'blocked' | 'self';

/** Публичный профиль пользователя для страницы `/u/:username`. */
export interface PublicProfile extends PublicUser {
  bio: string | null;
  /** Пол. Null — не указан. */
  gender: Gender | null;
  /** Дата рождения в формате `YYYY-MM-DD`. Null — не указана. */
  birthDate: string | null;
  /** Город. Null — не указан. */
  city: string | null;
  createdAt: string;
  online: boolean;
  currentRoom: RoomRef | null;
  /** ISO-время последнего захода (когда офлайн). Null, если онлайн или неизвестно. */
  lastSeenAt: string | null;
  /**
   * До 5 любимых фильмов/сериалов (по позиции #1..#5). Заполняется только на
   * странице профиля `/u/:username`; в результатах поиска отсутствует.
   */
  favoriteTitles?: FavoriteTitle[];
  /**
   * Друзья пользователя (публичные карточки) для секции «Друзья» в профиле.
   * `undefined` — список скрыт настройками приватности; `[]` — друзей нет.
   */
  friends?: PublicUser[];
  relationship: Relationship;
  /** Id записи дружбы/заявки — для accept/remove. */
  friendshipId: string | null;
}

export type NotificationType = 'friend_request' | 'friend_accepted' | 'room_invite';

/** Уведомление в колокольчике. `actor` — кто инициировал. */
export interface AppNotification {
  id: string;
  type: NotificationType;
  actor: PublicUser | null;
  /** Контекст: для room_invite — куда зовут. */
  data: { roomSlug?: string; roomName?: string };
  read: boolean;
  createdAt: string;
}

/** Live-присутствие друга, рассылается по пользовательскому WS-каналу. */
export interface FriendPresence {
  userId: string;
  online: boolean;
  currentRoom: RoomRef | null;
  /** ISO-время последнего захода (момент ухода в офлайн). Null, если онлайн или неизвестно. */
  lastSeenAt: string | null;
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
