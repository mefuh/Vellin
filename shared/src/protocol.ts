import type {
  AppNotification,
  CallMember,
  CallSnapshot,
  ChatMessage,
  DirectMessageDTO,
  FriendPresence,
  ParticipantInfo,
  PlaylistItem,
  PublicUser,
  ReactionEvent,
  RoomPermissions,
  RoomRole,
  RtcConfig,
  SyncStatus,
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
  | C2SSyncReport
  | C2SSyncAll
  | C2SSyncConfig
  | C2SPlaylistAdd
  | C2SPlaylistRemove
  | C2SPlaylistReorder
  | C2SPlaylistPlay
  | C2SPlaylistPrev
  | C2SCallJoin
  | C2SCallLeave
  | C2SCallMedia
  | C2SCallSignal
  | C2SCallSpeaking;

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
/**
 * Периодический отчёт клиента о своей реальной позиции и буферизации —
 * основа детекта рассинхрона (сервер сравнивает с авторитетной позицией).
 */
export interface C2SSyncReport {
  t: 'sync_report';
  /** Реальное `currentTime` плеера, сек. */
  currentTime: number;
  /** Идёт ли сейчас буферизация (затык). */
  buffering: boolean;
  /** Сколько секунд контента уже загружено вперёд от currentTime (для «ожидания»). */
  buffered: number;
  clientTs: number;
}
/** Хост/админ: мгновенно подтянуть всех к общей точке (импульс ресинка). */
export interface C2SSyncAll {
  t: 'sync_all';
  clientTs: number;
}
/** Хост/админ: включить/выключить авто-синхронизацию в моменты рассинхрона. */
export interface C2SSyncConfig {
  t: 'sync_config';
  autoSync: boolean;
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

// ── Call signaling (C2S) ────────────────────────────────────────────────

/** Portable mirror of `RTCIceCandidateInit` — structurally compatible with
 *  the browser type when client passes it to `addIceCandidate`. */
export interface IceCandidatePayload {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

/** Discriminated WebRTC signal envelope relayed peer-to-peer via the server. */
export type CallSignalPayload =
  | { kind: 'offer'; sdp: string }
  | { kind: 'answer'; sdp: string }
  | { kind: 'ice'; candidate: IceCandidatePayload | null };

export interface C2SCallJoin {
  t: 'call_join';
  /** Initial intent — mic always starts muted regardless. */
  wantVideo: boolean;
  clientTs: number;
}
export interface C2SCallLeave {
  t: 'call_leave';
  clientTs: number;
}
export interface C2SCallMedia {
  t: 'call_media';
  audio: boolean;
  video: boolean;
  clientTs: number;
}
export interface C2SCallSignal {
  t: 'call_signal';
  toUserId: string;
  payload: CallSignalPayload;
  clientTs: number;
}
/**
 * Sent on transitions only (started speaking / stopped speaking) so every
 * peer can render the same speaker indicator. Server relays to other call
 * members without persisting.
 */
export interface C2SCallSpeaking {
  t: 'call_speaking';
  speaking: boolean;
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
  | S2CVideoLoading
  | S2CSyncStatus
  | S2CReaction
  | S2CRoomStateUpdate
  | S2CPlaylistUpdate
  | S2CPermissionsUpdate
  | S2CUserKicked
  | S2CPing
  | S2CError
  | S2CCallState
  | S2CCallPeerJoined
  | S2CCallPeerLeft
  | S2CCallPeerMedia
  | S2CCallSignalRelay
  | S2CCallPeerSpeaking
  | S2CCallError;

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
  /** Snapshot of the room's voice/video call at join time (members may be empty). */
  call: CallSnapshot;
  /** ICE servers for any RTCPeerConnections this client opens. */
  rtc: RtcConfig;
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
/**
 * Видео начало меняться — рассылается ВСЕМ сразу при старте смены (до того как
 * сервер извлёк поток), чтобы плеер показал индикатор «меняем видео…» весь
 * интервал, а не только при загрузке у себя. `loading:false` — смена сорвалась
 * (резолв упал); успех закрывается приходом `video_set_url`.
 */
export interface S2CVideoLoading {
  t: 'video_loading';
  loading: boolean;
  byUserId: string;
  /** Известное название/ссылка для подписи карточки (если есть). */
  title?: string;
  sourceUrl?: string;
  serverTs: number;
}
/** Состояние синхронизации комнаты — питает информер плеера (см. SyncStatus). */
export interface S2CSyncStatus extends SyncStatus {
  t: 'sync_status';
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
    | 'blocked'
    | 'shadow_mode'
    | 'room_closed'
    | 'resolve_failed';
  message: string;
}

// ── Call signaling (S2C) ────────────────────────────────────────────────

export interface S2CCallState {
  t: 'call_state';
  snapshot: CallSnapshot;
  serverTs: number;
}
export interface S2CCallPeerJoined {
  t: 'call_peer_joined';
  member: CallMember;
  serverTs: number;
}
export interface S2CCallPeerLeft {
  t: 'call_peer_left';
  userId: string;
  serverTs: number;
}
export interface S2CCallPeerMedia {
  t: 'call_peer_media';
  userId: string;
  audio: boolean;
  video: boolean;
  serverTs: number;
}
export interface S2CCallSignalRelay {
  t: 'call_signal_relay';
  fromUserId: string;
  payload: CallSignalPayload;
  serverTs: number;
}
export interface S2CCallPeerSpeaking {
  t: 'call_peer_speaking';
  userId: string;
  speaking: boolean;
  serverTs: number;
}
export interface S2CCallError {
  t: 'call_error';
  code: 'voice_full' | 'video_full' | 'guest_forbidden' | 'not_in_call' | 'invalid_target';
  message: string;
}

// ── Пользовательский realtime-канал (app-wide WS `/ws/user`) ─────────────
//
// Полностью отдельный от комнатного протокола: подключается на всё время
// сессии и доставляет личные уведомления + presence друзей. Не смешивать с
// C2S/S2C — у канала свой набор сообщений.

export type UserS2C =
  | UserS2CHello
  | UserS2CNotification
  | UserS2CNotificationsRemoved
  | UserS2CPresence
  | UserS2CRoomVideo
  | UserS2CFriendsChanged
  | UserS2CDmMessage
  | UserS2CDmRead
  | UserS2CDmTyping
  | UserS2CDmError
  | UserS2CPing;

/** Снапшот при подключении: непрочитанные уведомления + presence друзей. */
export interface UserS2CHello {
  t: 'hello';
  notifications: AppNotification[];
  unreadCount: number;
  presence: FriendPresence[];
  /** Суммарно непрочитанных личных сообщений — для бейджа в навбаре. */
  dmUnreadTotal: number;
  serverTs: number;
}
export interface UserS2CNotification {
  t: 'notification';
  notification: AppNotification;
  unreadCount: number;
}
/**
 * Уведомления удалены (действие завершено: заявка принята/отклонена/отменена,
 * приглашение использовано). Клиент убирает их из списка по id, чтобы белл не
 * засорялся отыгранными уведомлениями.
 */
export interface UserS2CNotificationsRemoved {
  t: 'notifications_removed';
  ids: string[];
  unreadCount: number;
}
export interface UserS2CPresence {
  t: 'presence';
  presence: FriendPresence;
}
/**
 * Сменилось играющее видео в комнате — для живого обновления превью/названия в
 * открытой библиотеке. Шлётся только подписчикам (`watch_library`).
 */
export interface UserS2CRoomVideo {
  t: 'room_video';
  roomId: string;
  slug: string;
  videoPoster: string | null;
  videoTitle: string | null;
}
/** Сигнал «список друзей/заявок изменился — перезапроси по REST». */
export interface UserS2CFriendsChanged {
  t: 'friends_changed';
}
/**
 * Новое личное сообщение. Шлётся обоим участникам диалога: получателю и всем
 * соединениям отправителя (эхо — для синхронизации вкладок и присвоения id).
 * `unreadTotal` — суммарный счётчик непрочитанных получателя сообщения (для
 * бейджа); у эха отправителю он равен его собственному счётчику.
 */
export interface UserS2CDmMessage {
  t: 'dm_message';
  message: DirectMessageDTO;
  /** Собеседник в этом диалоге глазами получателя сообщения. */
  peer: PublicUser;
  unreadTotal: number;
}
/**
 * Переписку прочитали. Шлётся: (1) самому прочитавшему на остальные его
 * соединения — сбросить непрочитанные и бейдж (`unreadTotal` задан); (2)
 * собеседнику — обновить «галочки» на его сообщениях (`unreadTotal` опущен).
 */
export interface UserS2CDmRead {
  t: 'dm_read';
  conversationId: string;
  /** Кто прочитал. */
  byUserId: string;
  /** До какого момента прочитано (ISO). */
  readAt: string;
  /** Только в эхе самому прочитавшему — его новый суммарный счётчик. */
  unreadTotal?: number;
}
/** Собеседник печатает (или перестал). Транзиентно, не персистится. */
export interface UserS2CDmTyping {
  t: 'dm_typing';
  conversationId: string;
  fromUserId: string;
  typing: boolean;
}
/** Ошибка отправки ЛС (нет прав/заблокирован/слишком длинно). */
export interface UserS2CDmError {
  t: 'dm_error';
  /** nonce неудавшегося сообщения — чтобы клиент пометил его как непосланное. */
  nonce?: string;
  reason: string;
  message: string;
}
export interface UserS2CPing {
  t: 'ping';
  serverTs: number;
}

export type UserC2S =
  | UserC2SPong
  | UserC2SWatchPresence
  | UserC2SUnwatchPresence
  | UserC2SWatchLibrary
  | UserC2SUnwatchLibrary
  | UserC2SDmSend
  | UserC2SDmTyping
  | UserC2SDmRead;

export interface UserC2SPong {
  t: 'pong';
  serverTs: number;
}
/** Подписаться на live-присутствие пользователя (открыта его страница профиля). */
export interface UserC2SWatchPresence {
  t: 'watch_presence';
  userId: string;
}
/** Отписаться от live-присутствия пользователя (ушли со страницы). */
export interface UserC2SUnwatchPresence {
  t: 'unwatch_presence';
  userId: string;
}
/** Подписаться на live-обновления превью комнат (открыта библиотека). */
export interface UserC2SWatchLibrary {
  t: 'watch_library';
}
/** Отписаться от обновлений библиотеки (ушли со страницы). */
export interface UserC2SUnwatchLibrary {
  t: 'unwatch_library';
}
/** Отправить личное сообщение пользователю `toUserId`. */
export interface UserC2SDmSend {
  t: 'dm_send';
  toUserId: string;
  /** Текст (может быть пустым, если приложено изображение). */
  body: string;
  /** URL заранее загруженного изображения (через POST /dm/image), либо отсутствует. */
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  /** Клиентский идентификатор для сопоставления эха (оптимистичная отправка). */
  nonce: string;
}
/** Сигнал «печатаю/перестал» собеседнику `toUserId`. */
export interface UserC2SDmTyping {
  t: 'dm_typing';
  toUserId: string;
  typing: boolean;
}
/** Отметить переписку с `peerId` прочитанной (до текущего момента). */
export interface UserC2SDmRead {
  t: 'dm_read';
  peerId: string;
}

// ── Type guards ────────────────────────────────────────────────────────
export function isC2S(value: unknown): value is C2S {
  return typeof value === 'object' && value !== null && typeof (value as { t?: unknown }).t === 'string';
}

export function isUserC2S(value: unknown): value is UserC2S {
  return typeof value === 'object' && value !== null && typeof (value as { t?: unknown }).t === 'string';
}
