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

/**
 * Глобальный реестр пользовательских соединений + live-присутствие.
 * Singleton (как `prisma`). Не знает про БД — друзей для presence-рассылки
 * получает через инъектируемый резолвер (`setFriendResolver`), чтобы не
 * заводить цикл импортов с сервисом друзей.
 */
class UserHub {
  /** userId → набор открытых соединений. */
  private readonly conns = new Map<string, Set<UserConnection>>();
  /** userId → комната, которую он сейчас смотрит. */
  private readonly rooms = new Map<string, RoomRef>();
  private friendResolver: FriendResolver | null = null;

  setFriendResolver(fn: FriendResolver): void {
    this.friendResolver = fn;
  }

  attach(conn: UserConnection): void {
    let set = this.conns.get(conn.userId);
    if (!set) {
      set = new Set();
      this.conns.set(conn.userId, set);
    }
    const wasOffline = set.size === 0;
    set.add(conn);
    if (wasOffline) void this.broadcastPresence(conn.userId);
  }

  detach(conn: UserConnection): void {
    const set = this.conns.get(conn.userId);
    if (!set) return;
    set.delete(conn);
    if (set.size === 0) {
      this.conns.delete(conn.userId);
      this.rooms.delete(conn.userId);
      void this.broadcastPresence(conn.userId);
    }
  }

  isOnline(userId: string): boolean {
    return this.conns.has(userId);
  }

  roomOf(userId: string): RoomRef | null {
    return this.isOnline(userId) ? this.rooms.get(userId) ?? null : null;
  }

  presenceOf(userId: string): FriendPresence {
    return { userId, online: this.isOnline(userId), currentRoom: this.roomOf(userId) };
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

  /** Отправить сообщение всем соединениям пользователя. */
  pushTo(userId: string, msg: UserS2C): void {
    const set = this.conns.get(userId);
    if (!set) return;
    for (const c of set) {
      if (c.isOpen()) c.send(msg);
    }
  }

  /** Разослать обновлённое присутствие пользователя его онлайн-друзьям. */
  private async broadcastPresence(userId: string): Promise<void> {
    if (!this.friendResolver) return;
    let friendIds: string[];
    try {
      friendIds = await this.friendResolver(userId);
    } catch (err) {
      logger.error({ err, userId }, 'presence: friend resolver failed');
      return;
    }
    const presence = this.presenceOf(userId);
    for (const fid of friendIds) {
      this.pushTo(fid, { t: 'presence', presence });
    }
  }
}

export const userHub = new UserHub();
