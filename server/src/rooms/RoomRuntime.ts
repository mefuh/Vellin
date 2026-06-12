import type { Room, User } from '@prisma/client';
import type {
  CallMember,
  CallSnapshot,
  ChatMessage,
  ParticipantInfo,
  PlaylistItem,
  ReactionEvent,
  ResolvedMedia,
  RoomPermissions,
  RoomRole,
  S2C,
  SyncLaggard,
  SyncStatus,
  VideoState,
  VideoStatus,
} from '@vellin/shared';
import {
  ALL_PERMISSIONS,
  CALL_MAX_VIDEO,
  CALL_MAX_VOICE,
  DEFAULT_GUEST_PERMISSIONS,
} from '@vellin/shared';
import { prisma } from '../db/prisma.js';
import { roomMutex } from '../utils/async-mutex.js';
import { logger } from '../utils/logger.js';
import { roomStore } from './store.js';
import { userHub } from '../realtime/UserHub.js';
import { principalAvatarUrl, type Principal } from '../auth/jwt.js';
import {
  getEffectivePermissions,
  type PermissionKey,
} from './permissions.js';
import {
  setMembershipPermissions,
  setMembershipRole,
  type MembershipRole,
} from './membership.js';

const HEARTBEAT_INTERVAL_MS = 5000;
const PING_INTERVAL_MS = 10000;
const PARTICIPANT_GRACE_MS = 10000;
const PERSIST_INTERVAL_MS = 15000;
const MAX_PLAYLIST_ITEMS = 100;
const MAX_HISTORY_ITEMS = 10;

// ── Умная синхронизация ────────────────────────────────────────────────
const SYNC_EVAL_INTERVAL_MS = 2000; // как часто оцениваем рассинхрон
const SYNC_REPORT_STALE_MS = 6000; // репорты старше — игнорируем
const SYNC_DRIFT_THRESHOLD = 2.0; // |drift| ≥ — участник «отстаёт»
const SYNC_DECLARE_MS = 3000; // держится столько → объявляем рассинхрон
const SYNC_CLEAR_MS = 2000; // в синке столько → снимаем
const SYNC_RESYNC_DRIFT = 4.0; // крупный дрифт без буфера → импульс (авто)
const SYNC_RESYNC_COOLDOWN_MS = 5000; // не чаще одного импульса
const SYNC_WAIT_MIN_MS = 1500; // минимум подождать перед резюмом
const SYNC_WAIT_MAX_MS = 12000; // максимум ожидания отстающих
const SYNC_RESUME_BUFFER_SEC = 4; // столько надо догрузить вперёд для резюма
/** Псевдо-инициатор для системных мутаций (авто-пауза/резюм/импульс). */
const SYNC_ACTOR = '__sync__';

export interface Session {
  sessionId: string;
  principal: Principal;
  send(msg: S2C): void;
  close(code: number, reason: string): void;
  isOpen(): boolean;
}

/**
 * Typed business failure from the voice/video call layer — mapped to
 * `S2CCallError` by the handler. Plain `Error` still escapes as `S2CError`.
 */
export class CallError extends Error {
  constructor(
    readonly code: 'voice_full' | 'video_full' | 'guest_forbidden' | 'not_in_call' | 'invalid_target',
    message: string,
  ) {
    super(message);
    this.name = 'CallError';
  }
}

interface SessionEntry {
  session: Session;
  joinedAt: number;
  role: RoomRole;
  permissions: RoomPermissions;
  /** When set, the participant is being kept alive for reconnection. */
  pendingRemovalTimer?: NodeJS.Timeout;
  /** Admin shadow-session: получает broadcast'ы, но скрыта от участников. */
  shadow?: boolean;
  /** Последний отчёт клиента о своей позиции/буфере (для детекта рассинхрона). */
  report?: { currentTime: number; buffering: boolean; buffered: number; atServerTs: number };
}

export interface AttachOptions {
  /**
   * Если true — сессия добавляется в shadowSessions, не попадает в
   * `listParticipants()`, не генерирует `user_join`/`user_leave`,
   * не учитывается в capacity. Любая C2S-команда отвергается.
   */
  shadow?: boolean;
}

export class RoomRuntime {
  readonly roomId: string;
  readonly slug: string;
  readonly name: string;
  /** Immutable — owner is the room creator forever. */
  readonly ownerUserId: string;
  maxParticipants: number;
  allowGuests: boolean;

  private videoUrl: string | null;
  /** In-memory only; reset to null on URL change unless the caller passes one. */
  private videoTitle: string | null = null;
  /** Snapshot of the active video's resolver result. Reset to null on URL change. */
  private videoResolved: ResolvedMedia | null = null;
  private positionSec: number;
  private anchorServerTs: number;
  private status: VideoStatus;
  private playbackRate = 1.0;
  private lastEventSeq = 0;

  /** Sessions keyed by userId (one active session per user). */
  readonly participants = new Map<string, SessionEntry>();
  /**
   * Shadow-сессии главного админа. Ключ — sessionId (а не userId), потому что
   * один и тот же админ может одновременно держать и обычную, и shadow-сессию.
   */
  private readonly shadowSessions = new Map<string, SessionEntry>();
  /** Active voice/video call members keyed by userId. Empty = no active call. */
  private readonly callMembers = new Map<string, CallMember>();
  private callStartedAt: number | null = null;
  private callStartedByUserId: string | null = null;
  readonly playlist: PlaylistItem[] = [];
  /** Last N played-and-replaced videos, newest at the end. Powers "previous". */
  private readonly history: PlaylistItem[] = [];
  private playlistCounter = 0;

  private heartbeatTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private persistTimer: NodeJS.Timeout | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private destroyed = false;

  // ── Состояние умной синхронизации ─────────────────────────────────────
  /** Авто-синхронизация (тумблер хоста). */
  private autoSync = false;
  /** Сейчас «ждём отстающих» (комната на авто-паузе ради буферизации). */
  private waiting = false;
  private waitStartedAt = 0;
  private resumeAfterWait = false;
  private waitLaggards: SyncLaggard[] = [];
  /** Гистерезис: когда началось текущее «плохое»/«хорошее» состояние. */
  private desyncSince = 0;
  private inSyncSince = 0;
  private desynced = false;
  private lastResyncAt = 0;
  /** Ключ последнего разосланного sync_status (анти-спам). */
  private lastSyncKey = '';

  constructor(room: Room) {
    this.roomId = room.id;
    this.slug = room.slug;
    this.name = room.name;
    this.ownerUserId = room.ownerId;
    this.maxParticipants = room.maxParticipants;
    this.allowGuests = room.allowGuests;
    this.videoUrl = room.videoUrl;
    this.positionSec = room.videoPositionSec;
    this.status = room.videoStatus === 'playing' ? 'playing' : 'paused';
    this.anchorServerTs = Date.now();
    this.videoResolved = parseResolvedJson(room.videoResolvedJson);
  }

  start(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => this.heartbeat(), HEARTBEAT_INTERVAL_MS);
    this.pingTimer = setInterval(() => this.broadcastPing(), PING_INTERVAL_MS);
    this.persistTimer = setInterval(() => {
      void this.persist().catch((e) => logger.error({ err: e }, 'persist failed'));
    }, PERSIST_INTERVAL_MS);
    this.syncTimer = setInterval(() => this.evaluateSync(), SYNC_EVAL_INTERVAL_MS);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.persistTimer) clearInterval(this.persistTimer);
    if (this.syncTimer) clearInterval(this.syncTimer);
    for (const entry of this.participants.values()) {
      if (entry.pendingRemovalTimer) clearTimeout(entry.pendingRemovalTimer);
    }
    this.participants.clear();
    this.shadowSessions.clear();
    this.callMembers.clear();
    this.callStartedAt = null;
    this.callStartedByUserId = null;
    roomStore.delete(this.roomId);
  }

  // ── State accessors ───────────────────────────────────────────────────

  private effectivePosition(now: number): number {
    if (this.status !== 'playing') return this.positionSec;
    const elapsed = (now - this.anchorServerTs) / 1000;
    return this.positionSec + elapsed * this.playbackRate;
  }

  snapshotVideo(): VideoState {
    return {
      url: this.videoUrl,
      title: this.videoTitle,
      resolved: this.videoResolved,
      positionSec: this.positionSec,
      anchorServerTs: this.anchorServerTs,
      status: this.status,
      playbackRate: this.playbackRate,
      lastEventSeq: this.lastEventSeq,
      hostUserId: this.ownerUserId,
    };
  }

  snapshotPlaylist(): PlaylistItem[] {
    return this.playlist.map((p) => ({ ...p }));
  }

  // ── Call (voice/video) — callers must hold roomMutex 'call:<id>' ─────

  snapshotCall(): CallSnapshot {
    return {
      members: [...this.callMembers.values()].map((m) => ({ ...m })),
      startedByUserId: this.callStartedByUserId,
      startedAt: this.callStartedAt,
    };
  }

  callHas(userId: string): boolean {
    return this.callMembers.has(userId);
  }

  joinCall(userId: string, wantVideo: boolean): CallMember {
    const entry = this.participants.get(userId);
    if (!entry) throw new CallError('not_in_call', 'Сначала войдите в комнату');
    if (entry.session.principal.kind === 'guest') {
      throw new CallError('guest_forbidden', 'Звонок доступен только зарегистрированным');
    }
    const existing = this.callMembers.get(userId);
    if (existing) return { ...existing };
    if (this.callMembers.size >= CALL_MAX_VOICE) {
      throw new CallError('voice_full', `В звонке уже ${CALL_MAX_VOICE} участников`);
    }
    const videoSlotFree =
      [...this.callMembers.values()].filter((m) => m.video).length < CALL_MAX_VIDEO;
    const now = Date.now();
    const member: CallMember = {
      userId,
      audio: false, // mic always starts muted
      video: !!wantVideo && videoSlotFree,
      joinedAt: now,
    };
    this.callMembers.set(userId, member);
    if (this.callMembers.size === 1) {
      this.callStartedAt = now;
      this.callStartedByUserId = userId;
    }
    return { ...member };
  }

  leaveCall(userId: string): boolean {
    const removed = this.callMembers.delete(userId);
    if (this.callMembers.size === 0) {
      this.callStartedAt = null;
      this.callStartedByUserId = null;
    }
    return removed;
  }

  setCallMedia(userId: string, next: { audio: boolean; video: boolean }): CallMember {
    const cur = this.callMembers.get(userId);
    if (!cur) throw new CallError('not_in_call', 'Вы не в звонке');
    if (next.video && !cur.video) {
      const live = [...this.callMembers.values()].filter((m) => m.video).length;
      if (live >= CALL_MAX_VIDEO) {
        throw new CallError('video_full', `Камеры заняты (${CALL_MAX_VIDEO}/${CALL_MAX_VIDEO})`);
      }
    }
    cur.audio = !!next.audio;
    cur.video = !!next.video;
    return { ...cur };
  }

  /** Cleans up call membership when a user is removed from the room outright. */
  private evictFromCall(userId: string): boolean {
    if (!this.callMembers.delete(userId)) return false;
    if (this.callMembers.size === 0) {
      this.callStartedAt = null;
      this.callStartedByUserId = null;
    }
    this.broadcast({ t: 'call_peer_left', userId, serverTs: Date.now() });
    return true;
  }

  listParticipants(): ParticipantInfo[] {
    const out: ParticipantInfo[] = [];
    for (const entry of this.participants.values()) {
      const p = entry.session.principal;
      out.push({
        userId: p.userId,
        username: p.username,
        avatarSeed: p.avatarSeed,
        avatarUrl: principalAvatarUrl(p),
        kind: p.kind,
        isHost: p.userId === this.ownerUserId,
        role: entry.role,
        permissions: entry.permissions,
        joinedAt: entry.joinedAt,
      });
    }
    return out;
  }

  // ── Roles & permissions ──────────────────────────────────────────────

  getRole(userId: string): RoomRole {
    if (userId === this.ownerUserId) return 'owner';
    const entry = this.participants.get(userId);
    return entry?.role ?? 'guest';
  }

  getPermissions(userId: string): RoomPermissions {
    if (userId === this.ownerUserId) return { ...ALL_PERMISSIONS };
    const entry = this.participants.get(userId);
    if (entry) return entry.permissions;
    return { ...DEFAULT_GUEST_PERMISSIONS };
  }

  assertPermission(userId: string, key: PermissionKey): boolean {
    if (userId === this.ownerUserId) return true;
    const entry = this.participants.get(userId);
    return !!entry && entry.permissions[key] === true;
  }

  /**
   * Owner-only mutation: change role and/or permissions of a member.
   * Persists to Prisma, updates the live SessionEntry if online, broadcasts
   * S2CPermissionsUpdate to everyone.
   */
  async updateMembership(
    targetUserId: string,
    patch: { role?: MembershipRole; permissions?: Partial<RoomPermissions> },
  ): Promise<{ role: RoomRole; permissions: RoomPermissions }> {
    if (targetUserId === this.ownerUserId) {
      throw new Error('Cannot modify owner membership');
    }
    let record;
    if (patch.role !== undefined) {
      record = await setMembershipRole(this.roomId, targetUserId, patch.role);
    }
    if (patch.permissions !== undefined) {
      record = await setMembershipPermissions(this.roomId, targetUserId, patch.permissions);
    }
    if (!record) {
      throw new Error('updateMembership called with no changes');
    }
    const role = record.role as RoomRole;
    const permissions = getEffectivePermissions(role, record.permissionsJson);
    // Update live session if online.
    const entry = this.participants.get(targetUserId);
    if (entry) {
      entry.role = role;
      entry.permissions = permissions;
    }
    this.broadcast({
      t: 'permissions_update',
      userId: targetUserId,
      role,
      permissions,
      serverTs: Date.now(),
    });
    return { role, permissions };
  }

  /**
   * Force-disconnect a participant. Returns true if they were online.
   * Does NOT remove Membership (kicked users retain their saved permissions on rejoin).
   * Главный админ (`byUserId` — superadmin) может кикнуть кого угодно, включая
   * владельца комнаты.
   */
  kickParticipant(byUserId: string, targetUserId: string): boolean {
    const entry = this.participants.get(targetUserId);
    if (!entry) return false;
    const session = entry.session;
    // Notify the kicked user before closing.
    try {
      session.send({
        t: 'error',
        code: 'kicked',
        message: 'You have been removed from the room',
      });
    } catch {
      /* ignore */
    }
    if (entry.pendingRemovalTimer) {
      clearTimeout(entry.pendingRemovalTimer);
      entry.pendingRemovalTimer = undefined;
    }
    this.participants.delete(targetUserId);
    this.evictFromCall(targetUserId);
    try {
      session.close(4403, 'kicked');
    } catch {
      /* ignore */
    }
    this.broadcast({
      t: 'user_kicked',
      userId: targetUserId,
      byUserId,
      serverTs: Date.now(),
    });
    this.broadcast({ t: 'user_leave', userId: targetUserId, serverTs: Date.now() });
    if (this.participants.size === 0) {
      this.destroy();
    }
    return true;
  }

  // ── Membership (session lifecycle) ───────────────────────────────────

  isAtCapacity(): boolean {
    let active = 0;
    for (const entry of this.participants.values()) {
      if (!entry.pendingRemovalTimer) active++;
    }
    return active >= this.maxParticipants;
  }

  /**
   * Attach an active session for a user with their resolved role+permissions.
   * If the user already has a session, the old one is replaced (and old socket
   * closed) — silent reconnection.
   * @returns true if the join is a fresh appearance to others, false if reconnect.
   *
   * При `opts.shadow=true` сессия добавляется в параллельную карту скрытых
   * сессий: она НЕ попадает в `listParticipants()` / `user_join` / capacity,
   * но получает все S2C-broadcast'ы.
   */
  attachSession(
    session: Session,
    role: RoomRole,
    permissions: RoomPermissions,
    opts: AttachOptions = {},
  ): { isReconnect: boolean } {
    if (opts.shadow) {
      this.shadowSessions.set(session.sessionId, {
        session,
        joinedAt: Date.now(),
        role,
        permissions,
        shadow: true,
      });
      return { isReconnect: false };
    }
    const userId = session.principal.userId;
    // Presence: отмечаем, что пользователь смотрит эту комнату (для друзей).
    if (session.principal.kind === 'user') {
      userHub.setRoom(userId, { slug: this.slug, name: this.name });
    }
    const existing = this.participants.get(userId);
    if (existing) {
      if (existing.pendingRemovalTimer) {
        clearTimeout(existing.pendingRemovalTimer);
        existing.pendingRemovalTimer = undefined;
      }
      // Replace stale socket — but never close ourselves.
      if (existing.session !== session && existing.session.isOpen()) {
        try {
          existing.session.close(4001, 'replaced by new session');
        } catch {
          /* ignore */
        }
      }
      existing.session = session;
      existing.role = role;
      existing.permissions = permissions;
      return { isReconnect: true };
    }
    this.participants.set(userId, {
      session,
      joinedAt: Date.now(),
      role,
      permissions,
    });
    return { isReconnect: false };
  }

  /**
   * Mark a session as disconnected. Removal is deferred to allow reconnect.
   * Owner remains owner even when offline (owner = Room.ownerId, immutable).
   * Shadow-сессии удаляются мгновенно и не генерируют user_leave.
   */
  detachSession(session: Session): void {
    // Shadow path: identified by sessionId.
    const shadow = this.shadowSessions.get(session.sessionId);
    if (shadow && shadow.session === session) {
      this.shadowSessions.delete(session.sessionId);
      return;
    }
    const userId = session.principal.userId;
    const entry = this.participants.get(userId);
    if (!entry || entry.session !== session) return;
    entry.pendingRemovalTimer = setTimeout(() => {
      const current = this.participants.get(userId);
      if (!current || current.session !== session) return;
      this.participants.delete(userId);
      if (session.principal.kind === 'user') userHub.clearRoom(userId, this.slug);
      this.evictFromCall(userId);
      this.broadcast({ t: 'user_leave', userId, serverTs: Date.now() });
      if (this.participants.size === 0 && this.shadowSessions.size === 0) {
        this.destroy();
      }
    }, PARTICIPANT_GRACE_MS);
  }

  /** Является ли активная сессия пользователя shadow-сессией. */
  isShadowSession(sessionId: string): boolean {
    return this.shadowSessions.has(sessionId);
  }

  /**
   * Принудительно завершить активный звонок. Все callMembers удаляются и
   * рассылается `call_state` с пустым snapshot. Сами WS-сессии остаются.
   */
  endCall(): number {
    const count = this.callMembers.size;
    if (count === 0) return 0;
    this.callMembers.clear();
    this.callStartedAt = null;
    this.callStartedByUserId = null;
    this.broadcast({
      t: 'call_state',
      snapshot: this.snapshotCall(),
      serverTs: Date.now(),
    });
    return count;
  }

  /**
   * Принудительно закрыть комнату из админ-панели: всех участников выкидывает,
   * runtime уничтожается. Запись `Room` в БД НЕ трогается.
   */
  forceClose(byAdminUserId: string): number {
    const userIds = [...this.participants.keys()];
    for (const userId of userIds) {
      const entry = this.participants.get(userId);
      if (!entry) continue;
      try {
        entry.session.send({
          t: 'error',
          code: 'room_closed',
          message: 'Комната закрыта администратором',
        });
      } catch {
        /* ignore */
      }
      try {
        entry.session.send({
          t: 'user_kicked',
          userId,
          byUserId: byAdminUserId,
          serverTs: Date.now(),
        });
      } catch {
        /* ignore */
      }
      try {
        entry.session.close(4403, 'room closed');
      } catch {
        /* ignore */
      }
    }
    for (const entry of this.shadowSessions.values()) {
      try {
        entry.session.send({
          t: 'error',
          code: 'room_closed',
          message: 'Комната закрыта',
        });
      } catch {
        /* ignore */
      }
      try {
        entry.session.close(4403, 'room closed');
      } catch {
        /* ignore */
      }
    }
    const kicked = userIds.length;
    this.destroy();
    return kicked;
  }

  /**
   * Найти и закрыть конкретного пользователя в этой комнате (для блокировки
   * пользователя из админ-панели). Возвращает true если сессия была активна.
   */
  closeUserSessions(userId: string, reason: 'blocked' | 'deleted'): boolean {
    const entry = this.participants.get(userId);
    if (!entry) return false;
    try {
      entry.session.send({
        t: 'error',
        code: 'blocked',
        message:
          reason === 'blocked'
            ? 'Ваш аккаунт заблокирован администратором'
            : 'Ваш аккаунт удалён',
      });
    } catch {
      /* ignore */
    }
    if (entry.pendingRemovalTimer) {
      clearTimeout(entry.pendingRemovalTimer);
      entry.pendingRemovalTimer = undefined;
    }
    this.participants.delete(userId);
    this.evictFromCall(userId);
    try {
      entry.session.close(4403, reason);
    } catch {
      /* ignore */
    }
    this.broadcast({ t: 'user_leave', userId, serverTs: Date.now() });
    if (this.participants.size === 0 && this.shadowSessions.size === 0) {
      this.destroy();
    }
    return true;
  }

  // ── Mutating events (serialized) ──────────────────────────────────────

  applyPlay(byUserId: string, requestedPosition: number): boolean {
    return (
      this.assertPermission(byUserId, 'canPlayPause') &&
      this.mutate(byUserId, 'play', requestedPosition, 'playing')
    );
  }
  applyPause(byUserId: string, requestedPosition: number): boolean {
    return (
      this.assertPermission(byUserId, 'canPlayPause') &&
      this.mutate(byUserId, 'pause', requestedPosition, 'paused')
    );
  }
  applySeek(byUserId: string, requestedPosition: number, playing: boolean): boolean {
    return (
      this.assertPermission(byUserId, 'canSeek') &&
      this.mutate(byUserId, 'seek', requestedPosition, playing ? 'playing' : 'paused')
    );
  }

  private mutate(
    byUserId: string,
    action: 'play' | 'pause' | 'seek',
    requestedPosition: number,
    nextStatus: VideoStatus,
  ): boolean {
    const now = Date.now();
    const clamped = Math.max(
      0,
      Number.isFinite(requestedPosition) ? requestedPosition : this.effectivePosition(now),
    );
    this.positionSec = clamped;
    this.anchorServerTs = now;
    this.status = nextStatus;
    this.lastEventSeq += 1;
    this.broadcast({
      t: 'video_apply',
      action,
      positionSec: this.positionSec,
      anchorServerTs: this.anchorServerTs,
      emittedServerTs: now,
      status: this.status,
      seq: this.lastEventSeq,
      byUserId,
    });
    return true;
  }

  // ── Умная синхронизация ───────────────────────────────────────────────

  /** Принять отчёт клиента о реальной позиции/буферизации. */
  recordSyncReport(userId: string, currentTime: number, buffering: boolean, buffered: number): void {
    const entry = this.participants.get(userId);
    if (!entry || !Number.isFinite(currentTime)) return;
    entry.report = {
      currentTime,
      buffering: !!buffering,
      buffered: Number.isFinite(buffered) ? Math.max(0, buffered) : 0,
      atServerTs: Date.now(),
    };
  }

  /**
   * Хост/админ: «синхронизировать всех» = откатить всех к самому отстающему
   * (никто не пропускает контент). Если он застрял на буфере — паузим в его
   * точке и ждём догрузки; иначе мгновенный откат-импульс.
   */
  syncAll(byUserId: string): void {
    const now = Date.now();
    if (this.status === 'playing' && !this.waiting) {
      const laggards = this.collectLaggards(now);
      if (laggards.some((l) => l.buffering)) {
        this.enterWait(now, laggards);
        this.evaluateSync(true);
        return;
      }
    }
    this.forceResyncPulse(byUserId);
    this.evaluateSync(true);
  }

  /** Хост/админ: вкл/выкл авто-синхронизацию. */
  setAutoSync(_byUserId: string, on: boolean): void {
    if (this.autoSync === on) return;
    this.autoSync = on;
    if (!on && this.waiting) this.exitWait();
    this.evaluateSync(true);
  }

  /**
   * Позиция самого отстающего среди свежих репортов — цель ресинка. Откатываем
   * всех СЮДА (а не на живую/переднюю точку), чтобы отстающий не перескакивал
   * через непросмотренное: ушедшие вперёд отматываются назад к нему, контент не
   * пропускает никто. Буферящий стоит на месте; играющего проецируем к now.
   */
  private slowestPosition(now: number): number {
    let min = Infinity;
    for (const entry of this.participants.values()) {
      const r = entry.report;
      if (!r || now - r.atServerTs > SYNC_REPORT_STALE_MS) continue;
      const pos = r.buffering ? r.currentTime : r.currentTime + (now - r.atServerTs) / 1000;
      if (pos < min) min = pos;
    }
    return Number.isFinite(min) ? Math.max(0, min) : this.effectivePosition(now);
  }

  /** Переякорить всех на позицию самого медленного (откат назад) и поднять seq. */
  private forceResyncPulse(byUserId: string): void {
    const now = Date.now();
    this.positionSec = this.slowestPosition(now);
    this.anchorServerTs = now;
    this.lastEventSeq += 1;
    this.lastResyncAt = now;
    this.broadcast({
      t: 'video_apply',
      action: 'seek',
      positionSec: this.positionSec,
      anchorServerTs: this.anchorServerTs,
      emittedServerTs: now,
      status: this.status,
      seq: this.lastEventSeq,
      byUserId,
    });
  }

  private enterWait(now: number, laggards: SyncLaggard[]): void {
    if (this.waiting) return;
    this.waiting = true;
    this.waitStartedAt = now;
    this.waitLaggards = laggards.filter((l) => l.buffering || l.driftSec <= -SYNC_DRIFT_THRESHOLD);
    this.resumeAfterWait = this.status === 'playing';
    if (this.status === 'playing') {
      // Пауза в точке самого медленного: ушедшие вперёд отматываются назад к
      // отстающему (он стоит на своём месте), затем все ждут, пока он догрузит.
      // Так отстающий не перепрыгивает через непросмотренное.
      this.mutate(SYNC_ACTOR, 'pause', this.slowestPosition(now), 'paused');
    }
  }

  private exitWait(): void {
    if (!this.waiting) return;
    this.waiting = false;
    this.waitLaggards = [];
    if (this.resumeAfterWait) {
      this.mutate(SYNC_ACTOR, 'play', this.effectivePosition(Date.now()), 'playing');
    }
    this.resumeAfterWait = false;
  }

  /** Достаточно ли отстающие догрузили вперёд, чтобы продолжить. */
  private laggardsReady(now: number): boolean {
    for (const entry of this.participants.values()) {
      const r = entry.report;
      if (!r || now - r.atServerTs > SYNC_REPORT_STALE_MS) continue;
      if (r.buffering || r.buffered < SYNC_RESUME_BUFFER_SEC) return false;
    }
    return true;
  }

  /** Текущие отстающие (буфер или |drift|≥порог). Только пока играем. */
  private collectLaggards(now: number): SyncLaggard[] {
    const laggards: SyncLaggard[] = [];
    if (this.status !== 'playing') return laggards;
    for (const [userId, entry] of this.participants.entries()) {
      const r = entry.report;
      if (!r || now - r.atServerTs > SYNC_REPORT_STALE_MS) continue;
      const drift = r.currentTime - this.effectivePosition(r.atServerTs);
      if (r.buffering || Math.abs(drift) >= SYNC_DRIFT_THRESHOLD) {
        laggards.push({
          userId,
          username: entry.session.principal.username ?? 'гость',
          driftSec: drift,
          buffering: r.buffering,
        });
      }
    }
    return laggards;
  }

  /** Периодическая оценка рассинхрона + авто-резолюция (умный гибрид). */
  private evaluateSync(forceEmit = false): void {
    const now = Date.now();
    if (!this.videoUrl || this.participants.size === 0) {
      this.desynced = false;
      this.waiting = false;
      this.desyncSince = this.inSyncSince = 0;
      this.emitSyncStatus([], 'none', forceEmit);
      return;
    }

    // Лаггарды считаем только пока играем (на паузе все в одной точке).
    const laggards = this.collectLaggards(now);
    let worst = 0;
    let anyBuffering = false;
    for (const l of laggards) {
      worst = Math.max(worst, Math.abs(l.driftSec));
      if (l.buffering) anyBuffering = true;
    }

    // Гистерезис флага `desynced`.
    if (laggards.length > 0) {
      this.inSyncSince = 0;
      if (this.desyncSince === 0) this.desyncSince = now;
    } else {
      this.desyncSince = 0;
      if (this.inSyncSince === 0) this.inSyncSince = now;
    }
    if (!this.desynced && this.desyncSince !== 0 && now - this.desyncSince >= SYNC_DECLARE_MS) {
      this.desynced = true;
    } else if (this.desynced && this.inSyncSince !== 0 && now - this.inSyncSince >= SYNC_CLEAR_MS) {
      this.desynced = false;
    }

    // Прогресс ожидания идёт ВСЕГДА — в wait могли войти и вручную (sync_all),
    // тогда комната тоже обязана сама возобновиться, когда отстающие догрузят.
    if (this.waiting) {
      const elapsed = now - this.waitStartedAt;
      if (elapsed >= SYNC_WAIT_MAX_MS || (elapsed >= SYNC_WAIT_MIN_MS && this.laggardsReady(now))) {
        this.exitWait();
      }
    } else if (this.autoSync && this.desynced && this.status === 'playing') {
      // Умный гибрид. Кто-то БУФЕРИТ (застрял) → паузим всех в его точке и ждём,
      // пока догрузит. Иначе крупный дрифт → импульс: откатываем всех к самому
      // медленному (ушедшие вперёд отматываются назад, отстающий ничего не
      // пропускает). Умеренный дрифт (<4с) — клиентский движок тянет скоростью.
      if (anyBuffering) {
        this.enterWait(now, laggards);
      } else if (worst >= SYNC_RESYNC_DRIFT && now - this.lastResyncAt >= SYNC_RESYNC_COOLDOWN_MS) {
        this.forceResyncPulse(SYNC_ACTOR);
      }
    }

    const reason: SyncStatus['reason'] = this.waiting
      ? 'buffering'
      : this.desynced
        ? anyBuffering
          ? 'buffering'
          : 'drift'
        : 'none';
    this.emitSyncStatus(this.waiting ? this.waitLaggards : laggards, reason, forceEmit);
  }

  /** Разослать sync_status — только при смене ключевого состояния (или force). */
  private emitSyncStatus(laggards: SyncLaggard[], reason: SyncStatus['reason'], force: boolean): void {
    let worst = 0;
    for (const l of laggards) worst = Math.max(worst, Math.abs(l.driftSec));
    const key = [
      this.desynced ? '1' : '0',
      this.waiting ? '1' : '0',
      this.autoSync ? '1' : '0',
      reason,
      laggards.map((l) => l.userId).sort().join(','),
    ].join('|');
    if (!force && key === this.lastSyncKey) return;
    this.lastSyncKey = key;
    this.broadcast({
      t: 'sync_status',
      desynced: this.desynced,
      reason,
      laggards,
      worstDriftSec: worst,
      autoSync: this.autoSync,
      waiting: this.waiting,
      serverTs: Date.now(),
    });
  }

  /**
   * Switch the currently-playing video. If `pushPrevToHistory` is true and
   * there was a previous URL, push it into history so the "previous" button
   * can resurrect it. Skip the push for explicit prev/restore operations.
   * `resolved` is the server-side resolver result for the new URL — fall back
   * to a synthetic embed-shaped record only if the caller couldn't resolve
   * (legacy callers).
   */
  async setVideoUrl(
    url: string,
    byUserId: string,
    pushPrevToHistory = true,
    title: string | null = null,
    resolved: ResolvedMedia | null = null,
  ): Promise<void> {
    const prevUrl = this.videoUrl;
    const prevTitle = this.videoTitle;
    if (pushPrevToHistory && prevUrl) {
      this.history.push({
        id: `pl_hist_${Date.now()}_${++this.playlistCounter}`,
        url: prevUrl,
        title: prevTitle ?? undefined,
        addedByUserId: 'system',
        addedByUsername: 'history',
        addedAt: Date.now(),
      });
      if (this.history.length > MAX_HISTORY_ITEMS) {
        this.history.splice(0, this.history.length - MAX_HISTORY_ITEMS);
      }
    }
    this.videoUrl = url;
    this.videoTitle = title;
    this.videoResolved = resolved;
    this.positionSec = 0;
    this.anchorServerTs = Date.now();
    this.status = 'paused';
    this.lastEventSeq += 1;
    await prisma.room.update({
      where: { id: this.roomId },
      data: {
        videoUrl: url,
        videoPositionSec: 0,
        videoStatus: 'paused',
        videoUpdatedAt: new Date(),
        videoResolvedJson: resolved ? JSON.stringify(resolved) : null,
      },
    });
    this.broadcast({
      t: 'video_set_url',
      url,
      byUserId,
      serverTs: this.anchorServerTs,
      video: this.snapshotVideo(),
    });
    this.broadcastPlaylist(); // history length may have changed
  }

  /** Pop the most recent history entry and play it. Returns false if empty. */
  takePrevious(): PlaylistItem | null {
    return this.history.pop() ?? null;
  }

  historyLength(): number {
    return this.history.length;
  }

  // ── Playlist (callers must hold roomMutex 'video:<id>') ──────────────

  addPlaylistItem(byUserId: string, url: string, title?: string): PlaylistItem | null {
    if (this.playlist.length >= MAX_PLAYLIST_ITEMS) return null;
    const entry = this.participants.get(byUserId);
    const principal = entry?.session.principal;
    const id = `pl_${Date.now()}_${++this.playlistCounter}`;
    const item: PlaylistItem = {
      id,
      url,
      title,
      addedByUserId: byUserId,
      addedByUsername: principal?.username ?? 'unknown',
      addedAt: Date.now(),
    };
    this.playlist.push(item);
    this.broadcastPlaylist();
    return item;
  }

  /**
   * Update a playlist item's display title (typically after a background
   * resolver lookup pulled the canonical name from yt-dlp/Vimeo/etc.).
   * No-op when the item is gone, already has a title, or the new title is
   * empty — guards against late callbacks overwriting newer manual edits.
   */
  updatePlaylistItemTitle(itemId: string, title: string): void {
    const item = this.playlist.find((p) => p.id === itemId);
    if (!item) return;
    const next = title.trim();
    if (!next) return;
    if (item.title) return;
    item.title = next;
    this.broadcastPlaylist();
  }

  removePlaylistItem(_byUserId: string, itemId: string): boolean {
    const idx = this.playlist.findIndex((p) => p.id === itemId);
    if (idx === -1) return false;
    this.playlist.splice(idx, 1);
    this.broadcastPlaylist();
    return true;
  }

  reorderPlaylist(_byUserId: string, itemIds: string[]): boolean {
    if (itemIds.length !== this.playlist.length) return false;
    const byId = new Map(this.playlist.map((p) => [p.id, p]));
    const next: PlaylistItem[] = [];
    for (const id of itemIds) {
      const item = byId.get(id);
      if (!item) return false;
      next.push(item);
    }
    this.playlist.splice(0, this.playlist.length, ...next);
    this.broadcastPlaylist();
    return true;
  }

  /**
   * Called on video_ended. Returns the next item to play or null if:
   * - the playlist is empty, or
   * - the current URL doesn't match (race: someone already changed video).
   * Item is removed from the queue on success.
   */
  popNextOnEnded(currentUrl: string): PlaylistItem | null {
    if (this.videoUrl !== currentUrl) return null;
    if (this.playlist.length === 0) return null;
    const next = this.playlist.shift()!;
    this.broadcastPlaylist();
    return next;
  }

  /**
   * Manual jump to a specific playlist item. Removes it from the queue and
   * returns it; the caller is responsible for setVideoUrl + applyPlay.
   * Returns null if the item is no longer present.
   */
  takePlaylistItem(itemId: string): PlaylistItem | null {
    const idx = this.playlist.findIndex((p) => p.id === itemId);
    if (idx === -1) return null;
    const [item] = this.playlist.splice(idx, 1);
    this.broadcastPlaylist();
    return item;
  }

  private broadcastPlaylist(): void {
    this.broadcast({
      t: 'playlist_update',
      playlist: this.snapshotPlaylist(),
      historyLength: this.history.length,
      serverTs: Date.now(),
    });
  }

  // ── Chat ──────────────────────────────────────────────────────────────

  async appendChatMessage(senderId: string, body: string, nonce: string): Promise<ChatMessage | null> {
    const entry = this.participants.get(senderId);
    if (!entry) return null;
    const principal = entry.session.principal;
    const trimmed = body.trim();
    if (!trimmed || trimmed.length > 2000) return null;

    if (principal.kind === 'guest') {
      const id = `m_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      const msg: ChatMessage = {
        id,
        roomId: this.roomId,
        kind: 'user',
        body: trimmed,
        createdAt: new Date().toISOString(),
        author: {
          id: principal.userId,
          username: principal.username,
          avatarSeed: principal.avatarSeed,
          avatarUrl: null,
          kind: 'guest',
        },
      };
      // Persist guest messages with userId=null so chat history survives.
      await prisma.message.create({
        data: {
          id,
          roomId: this.roomId,
          kind: 'user',
          body: trimmed,
          guestName: principal.username,
          guestAvatarSeed: principal.avatarSeed,
        },
      });
      this.broadcast({ t: 'chat_message', message: msg, nonce });
      return msg;
    }

    const persisted = await prisma.message.create({
      data: {
        roomId: this.roomId,
        userId: principal.userId,
        kind: 'user',
        body: trimmed,
      },
      include: { user: { select: { id: true, username: true, avatarSeed: true, avatarUrl: true } } },
    });
    const msg: ChatMessage = {
      id: persisted.id,
      roomId: this.roomId,
      kind: 'user',
      body: persisted.body,
      createdAt: persisted.createdAt.toISOString(),
      author: {
        id: persisted.user!.id,
        username: persisted.user!.username,
        avatarSeed: persisted.user!.avatarSeed,
        avatarUrl: persisted.user!.avatarUrl,
        kind: 'user',
      },
    };
    this.broadcast({ t: 'chat_message', message: msg, nonce });
    return msg;
  }

  async appendSystemMessage(body: string): Promise<void> {
    const persisted = await prisma.message.create({
      data: {
        roomId: this.roomId,
        kind: 'system',
        body,
      },
    });
    const msg: ChatMessage = {
      id: persisted.id,
      roomId: this.roomId,
      kind: 'system',
      body,
      createdAt: persisted.createdAt.toISOString(),
      author: {
        id: 'system',
        username: 'system',
        avatarSeed: 'system',
        avatarUrl: null,
        kind: 'user',
      },
    };
    this.broadcast({ t: 'chat_message', message: msg });
  }

  // ── Reactions ─────────────────────────────────────────────────────────

  emitReaction(byUserId: string, emoji: string): void {
    const entry = this.participants.get(byUserId);
    if (!entry) return;
    const reaction: ReactionEvent = {
      id: `r_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
      emoji,
      userId: byUserId,
      username: entry.session.principal.username,
      createdAt: Date.now(),
    };
    this.broadcast({ t: 'reaction', reaction });
  }

  // ── Welcome payload ───────────────────────────────────────────────────

  async buildWelcome(forUserId: string): Promise<{
    video: VideoState;
    participants: ParticipantInfo[];
    recentMessages: ChatMessage[];
    you: ParticipantInfo;
    playlist: PlaylistItem[];
    historyLength: number;
    call: CallSnapshot;
  }> {
    const recent = await prisma.message.findMany({
      where: { roomId: this.roomId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { user: { select: { id: true, username: true, avatarSeed: true, avatarUrl: true } } },
    });
    const recentMessages: ChatMessage[] = recent
      .map((m) => ({
        id: m.id,
        roomId: m.roomId,
        kind: m.kind === 'system' ? ('system' as const) : ('user' as const),
        body: m.body,
        createdAt: m.createdAt.toISOString(),
        author: m.user
          ? {
              id: m.user.id,
              username: m.user.username,
              avatarSeed: m.user.avatarSeed,
              avatarUrl: m.user.avatarUrl,
              kind: 'user' as const,
            }
          : {
              id: m.userId ?? 'guest',
              username: m.guestName ?? 'Guest',
              avatarSeed: m.guestAvatarSeed ?? 'guest',
              avatarUrl: null,
              kind: 'guest' as const,
            },
      }))
      .reverse();
    const participants = this.listParticipants();
    const you = participants.find((p) => p.userId === forUserId);
    return {
      video: this.snapshotVideo(),
      participants,
      recentMessages,
      playlist: this.snapshotPlaylist(),
      historyLength: this.history.length,
      call: this.snapshotCall(),
      you:
        you ?? {
          userId: forUserId,
          username: 'unknown',
          avatarSeed: 'unknown',
          avatarUrl: null,
          kind: 'user',
          isHost: forUserId === this.ownerUserId,
          role: forUserId === this.ownerUserId ? 'owner' : 'guest',
          permissions:
            forUserId === this.ownerUserId
              ? { ...ALL_PERMISSIONS }
              : { ...DEFAULT_GUEST_PERMISSIONS },
          joinedAt: Date.now(),
        },
    };
  }

  // ── Internal: broadcast & timers ──────────────────────────────────────

  broadcast(msg: S2C, exceptUserId?: string): void {
    let delivered = 0;
    for (const [userId, entry] of this.participants.entries()) {
      if (exceptUserId && userId === exceptUserId) continue;
      try {
        entry.session.send(msg);
        delivered += 1;
      } catch (err) {
        logger.warn({ err, userId, roomId: this.roomId }, 'broadcast send failed');
      }
    }
    for (const entry of this.shadowSessions.values()) {
      try {
        entry.session.send(msg);
        delivered += 1;
      } catch (err) {
        logger.warn({ err, roomId: this.roomId, shadow: true }, 'broadcast send failed');
      }
    }
    if (msg.t !== 'video_sync' && msg.t !== 'ping') {
      logger.info(
        {
          t: msg.t,
          roomId: this.roomId,
          delivered,
          total: this.participants.size,
          shadow: this.shadowSessions.size,
        },
        'ws:broadcast',
      );
    }
  }

  private heartbeat(): void {
    if (!this.videoUrl || this.participants.size === 0) return;
    const now = Date.now();
    const sync: S2C = {
      t: 'video_sync',
      positionSec: this.positionSec,
      anchorServerTs: this.anchorServerTs,
      emittedServerTs: now,
      status: this.status,
      seq: this.lastEventSeq,
    };
    this.broadcast(sync);
  }

  private broadcastPing(): void {
    this.broadcast({ t: 'ping', serverTs: Date.now() });
  }

  private async persist(): Promise<void> {
    const now = Date.now();
    await prisma.room.update({
      where: { id: this.roomId },
      data: {
        videoPositionSec: this.effectivePosition(now),
        videoStatus: this.status,
        videoUpdatedAt: new Date(now),
      },
    });
  }
}

function parseResolvedJson(json: string | null): ResolvedMedia | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as ResolvedMedia;
    if (!parsed || typeof parsed.kind !== 'string' || typeof parsed.mediaUrl !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function ensureRoomRuntime(
  room: (Room & { owner: Pick<User, 'username'> }) | Room,
): Promise<RoomRuntime> {
  return roomMutex.run(`runtime:${room.id}`, () => {
    let runtime = roomStore.get(room.id);
    if (!runtime) {
      runtime = new RoomRuntime(room);
      runtime.start();
      roomStore.set(room.id, runtime);
    } else {
      // Keep latest config-only fields in sync.
      runtime.maxParticipants = room.maxParticipants;
      runtime.allowGuests = room.allowGuests;
    }
    return runtime;
  });
}
