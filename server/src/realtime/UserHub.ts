import type { FriendPresence, RoomRef, UserS2C } from '@vellin/shared';
import { logger } from '../utils/logger.js';

/**
 * Одно живое соединение пользовательского realtime-канала (`/ws/user`).
 * У одного пользователя может быть несколько (несколько вкладок/устройств).
 */
export interface UserConnection {
  id: string;
  userId: string;
  send(msg: UserS2C): void;
  isOpen(): boolean;
}

/** Возвращает id принятых друзей пользователя (для рассылки presence). */
type FriendResolver = (userId: string) => Promise<string[]>;
/** Персистит «был в сети» в БД при уходе пользователя в офлайн. */
type LastSeenWriter = (userId: string, at: Date) => void;

/**
 * Глобальный реестр пользовательских соединений + live-присутствие.
 * Singleton (как `prisma`). Не знает про БД — друзей для presence-рассылки и
 * запись «был в сети» получает через инъектируемые колбэки, чтобы не заводить
 * цикл импортов с сервисами.
 */
class UserHub {
  /** userId → набор открытых соединений. */
  private readonly conns = new Map<string, Set<UserConnection>>();
  /** userId → комната, которую он сейчас смотрит. */
  private readonly rooms = new Map<string, RoomRef>();
  /** userId → момент последнего ухода в офлайн (ms). In-memory, дублируется в БД. */
  private readonly lastSeen = new Map<string, number>();
  /** Кого смотрит соединение (открытые страницы профилей). */
  private readonly watchedByConn = new Map<UserConnection, Set<string>>();
  /** watchedUserId → соединения, подписанные на его присутствие. */
  private readonly watchersOf = new Map<string, Set<UserConnection>>();
  /** Соединения с открытой библиотекой — получают live-обновления превью комнат. */
  private readonly librarySubs = new Set<UserConnection>();
  private friendResolver: FriendResolver | null = null;
  private lastSeenWriter: LastSeenWriter | null = null;

  setFriendResolver(fn: FriendResolver): void {
    this.friendResolver = fn;
  }
  setLastSeenWriter(fn: LastSeenWriter): void {
    this.lastSeenWriter = fn;
  }

  attach(conn: UserConnection): void {
    let set = this.conns.get(conn.userId);
    if (!set) {
      set = new Set();
      this.conns.set(conn.userId, set);
    }
    const wasOffline = set.size === 0;
    set.add(conn);
    if (wasOffline) {
      this.lastSeen.delete(conn.userId); // снова онлайн
      void this.broadcastPresence(conn.userId);
    }
  }

  detach(conn: UserConnection): void {
    // Снять все подписки этого соединения.
    const watched = this.watchedByConn.get(conn);
    if (watched) {
      for (const target of watched) this.watchersOf.get(target)?.delete(conn);
      this.watchedByConn.delete(conn);
    }
    this.librarySubs.delete(conn);
    const set = this.conns.get(conn.userId);
    if (!set) return;
    set.delete(conn);
    if (set.size === 0) {
      this.conns.delete(conn.userId);
      this.rooms.delete(conn.userId);
      const now = Date.now();
      this.lastSeen.set(conn.userId, now);
      this.lastSeenWriter?.(conn.userId, new Date(now));
      void this.broadcastPresence(conn.userId);
    }
  }

  isOnline(userId: string): boolean {
    return this.conns.has(userId);
  }

  roomOf(userId: string): RoomRef | null {
    return this.isOnline(userId) ? this.rooms.get(userId) ?? null : null;
  }

  /** Время последнего захода (ms) из памяти хаба, либо null. */
  lastSeenMs(userId: string): number | null {
    return this.lastSeen.get(userId) ?? null;
  }

  presenceOf(userId: string): FriendPresence {
    const online = this.isOnline(userId);
    const seen = online ? null : this.lastSeen.get(userId);
    return {
      userId,
      online,
      currentRoom: this.roomOf(userId),
      lastSeenAt: seen ? new Date(seen).toISOString() : null,
    };
  }

  /** Подписать соединение на присутствие target (открыта его страница). */
  watch(conn: UserConnection, targetId: string): void {
    let watched = this.watchedByConn.get(conn);
    if (!watched) {
      watched = new Set();
      this.watchedByConn.set(conn, watched);
    }
    watched.add(targetId);
    let set = this.watchersOf.get(targetId);
    if (!set) {
      set = new Set();
      this.watchersOf.set(targetId, set);
    }
    set.add(conn);
    // Сразу отдать текущее состояние, чтобы подписчик синхронизировался.
    if (conn.isOpen()) conn.send({ t: 'presence', presence: this.presenceOf(targetId) });
  }

  unwatch(conn: UserConnection, targetId: string): void {
    this.watchedByConn.get(conn)?.delete(targetId);
    const set = this.watchersOf.get(targetId);
    if (set) {
      set.delete(conn);
      if (set.size === 0) this.watchersOf.delete(targetId);
    }
  }

  /** Вызывается RoomRuntime при входе пользователя в комнату. */
  setRoom(userId: string, room: RoomRef | null): void {
    const prevSlug = this.rooms.get(userId)?.slug ?? null;
    if (room) this.rooms.set(userId, room);
    else this.rooms.delete(userId);
    if (prevSlug !== (room?.slug ?? null)) void this.broadcastPresence(userId);
  }

  /** Очистить комнату, только если пользователь всё ещё «в» этой комнате. */
  clearRoom(userId: string, slug: string): void {
    if (this.rooms.get(userId)?.slug === slug) this.setRoom(userId, null);
  }

  /** Подписать соединение на live-обновления библиотеки (открыта страница). */
  watchLibrary(conn: UserConnection): void {
    this.librarySubs.add(conn);
  }

  unwatchLibrary(conn: UserConnection): void {
    this.librarySubs.delete(conn);
  }

  /** Разослать смену играющего видео всем, у кого открыта библиотека. */
  broadcastRoomVideo(payload: {
    roomId: string;
    slug: string;
    videoPoster: string | null;
    videoTitle: string | null;
  }): void {
    if (this.librarySubs.size === 0) return;
    const msg: UserS2C = { t: 'room_video', ...payload };
    for (const c of this.librarySubs) if (c.isOpen()) c.send(msg);
  }

  /** Отправить сообщение всем соединениям пользователя. */
  pushTo(userId: string, msg: UserS2C): void {
    const set = this.conns.get(userId);
    if (!set) return;
    for (const c of set) {
      if (c.isOpen()) c.send(msg);
    }
  }

  /** Разослать обновлённое присутствие его онлайн-друзьям и подписчикам. */
  private async broadcastPresence(userId: string): Promise<void> {
    const presence = this.presenceOf(userId);
    const msg: UserS2C = { t: 'presence', presence };

    // Подписчики на профиль (открытая страница /u/:username).
    const watchers = this.watchersOf.get(userId);
    if (watchers) {
      for (const c of watchers) if (c.isOpen()) c.send(msg);
    }

    if (!this.friendResolver) return;
    let friendIds: string[];
    try {
      friendIds = await this.friendResolver(userId);
    } catch (err) {
      logger.error({ err, userId }, 'presence: friend resolver failed');
      return;
    }
    for (const fid of friendIds) this.pushTo(fid, msg);
  }
}

export const userHub = new UserHub();
