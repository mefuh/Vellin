import type { FriendPresence, PrivacyRule, RoomRef, UserS2C } from '@vellin/shared';
import { DEFAULT_PRIVACY_RULE } from '@vellin/shared';
import { logger } from '../utils/logger.js';
import { canSee } from '../privacy/privacy.js';

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
/** Возвращает правило приватности категории «online» для пользователя. */
type OnlinePrivacyResolver = (userId: string) => Promise<PrivacyRule>;

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
  /**
   * Соединение → реально ли активен пользователь в этой вкладке (двигал
   * мышью/клавиатурой/тач недавно). Открытая, но простаивающая вкладка не
   * должна показывать пользователя онлайн — только открытый сокет недостаточно.
   */
  private readonly activeByConn = new Map<UserConnection, boolean>();
  /** Кого смотрит соединение (открытые страницы профилей). */
  private readonly watchedByConn = new Map<UserConnection, Set<string>>();
  /** watchedUserId → соединения, подписанные на его присутствие. */
  private readonly watchersOf = new Map<string, Set<UserConnection>>();
  /** Соединения с открытой библиотекой — получают live-обновления превью комнат. */
  private readonly librarySubs = new Set<UserConnection>();
  /** Фокус соединения: какой диалог открыт и видима ли вкладка (для подавления push). */
  private readonly focusByConn = new Map<UserConnection, { conversationId: string | null; visible: boolean }>();
  private friendResolver: FriendResolver | null = null;
  private lastSeenWriter: LastSeenWriter | null = null;
  private onlinePrivacyResolver: OnlinePrivacyResolver | null = null;
  /**
   * Хук на смену играющего видео комнаты — живая синхронизация карточек-
   * приглашений в ЛС (DI разрывает цикл импортов realtime↔dm). В отличие от
   * `broadcastRoomVideo`, вызывается ВСЕГДА (не гейтится подписчиками библиотеки).
   */
  private roomVideoChanged: ((p: { roomId: string; slug: string; videoPoster: string | null; videoTitle: string | null }) => void) | null = null;

  setFriendResolver(fn: FriendResolver): void {
    this.friendResolver = fn;
  }
  setLastSeenWriter(fn: LastSeenWriter): void {
    this.lastSeenWriter = fn;
  }
  setOnlinePrivacyResolver(fn: OnlinePrivacyResolver): void {
    this.onlinePrivacyResolver = fn;
  }
  setRoomVideoChangedHook(fn: (p: { roomId: string; slug: string; videoPoster: string | null; videoTitle: string | null }) => void): void {
    this.roomVideoChanged = fn;
  }

  attach(conn: UserConnection): void {
    let set = this.conns.get(conn.userId);
    if (!set) {
      set = new Set();
      this.conns.set(conn.userId, set);
    }
    const wasOnline = this.isOnline(conn.userId);
    set.add(conn);
    // Только что подключился — считаем активным, пока клиент не пришлёт иначе.
    this.activeByConn.set(conn, true);
    if (!wasOnline) {
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
    this.focusByConn.delete(conn);
    this.activeByConn.delete(conn);
    const set = this.conns.get(conn.userId);
    if (!set) return;
    const wasOnline = this.isOnline(conn.userId);
    set.delete(conn);
    if (set.size === 0) {
      this.conns.delete(conn.userId);
      this.rooms.delete(conn.userId);
    }
    if (wasOnline && !this.isOnline(conn.userId)) {
      const now = Date.now();
      this.lastSeen.set(conn.userId, now);
      this.lastSeenWriter?.(conn.userId, new Date(now));
      void this.broadcastPresence(conn.userId);
    }
  }

  /**
   * Онлайн — это открытый сокет И хотя бы одно соединение реально активно
   * (см. `activeByConn`). Простаивающая вкладка не в счёт.
   */
  isOnline(userId: string): boolean {
    const set = this.conns.get(userId);
    if (!set) return false;
    for (const c of set) {
      if (this.activeByConn.get(c) !== false) return true;
    }
    return false;
  }

  /**
   * Сколько РАЗНЫХ пользователей сейчас онлайн по всему сайту (открыт user-WS и
   * хотя бы одна вкладка реально активна) — не только те, кто в комнатах.
   * Источник живой статистики для админ-панели.
   */
  countOnline(): number {
    let n = 0;
    for (const userId of this.conns.keys()) {
      if (this.isOnline(userId)) n += 1;
    }
    return n;
  }

  /** Снапшот состояния пользовательского realtime-канала (для админ-мониторинга). */
  stats(): { connections: number; distinctUsers: number; online: number; watchers: number; librarySubs: number } {
    let connections = 0;
    for (const set of this.conns.values()) connections += set.size;
    return {
      connections,
      distinctUsers: this.conns.size,
      online: this.countOnline(),
      watchers: this.watchersOf.size,
      librarySubs: this.librarySubs.size,
    };
  }

  /** Клиент сообщил о смене реальной активности в конкретной вкладке. */
  setActivity(conn: UserConnection, active: boolean): void {
    if (this.activeByConn.get(conn) === active) return;
    const wasOnline = this.isOnline(conn.userId);
    this.activeByConn.set(conn, active);
    const nowOnline = this.isOnline(conn.userId);
    if (wasOnline === nowOnline) return;
    if (nowOnline) {
      this.lastSeen.delete(conn.userId);
    } else {
      const now = Date.now();
      this.lastSeen.set(conn.userId, now);
      this.lastSeenWriter?.(conn.userId, new Date(now));
    }
    void this.broadcastPresence(conn.userId);
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
    // Сразу отдать текущее состояние (с учётом приватности), чтобы подписчик
    // синхронизировался — иначе скрытый онлайн «протёк» бы мимо REST-гейтинга.
    void this.sendGatedPresence(conn, targetId);
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

  /** Запомнить фокус соединения (открытый диалог + видимость вкладки). */
  setFocus(conn: UserConnection, conversationId: string | null, visible: boolean): void {
    this.focusByConn.set(conn, { conversationId, visible });
  }

  /**
   * Читает ли пользователь ПРЯМО СЕЙЧАС указанный диалог: есть открытое
   * соединение с видимой вкладкой и этим conversationId. Используется, чтобы не
   * слать push о ЛС тому, кто уже в этом диалоге.
   */
  isViewingConversation(userId: string, conversationId: string): boolean {
    const set = this.conns.get(userId);
    if (!set) return false;
    for (const c of set) {
      const f = this.focusByConn.get(c);
      if (f && f.visible && f.conversationId === conversationId) return true;
    }
    return false;
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
    // Живая синхронизация карточек-приглашений — независимо от подписчиков библиотеки.
    this.roomVideoChanged?.(payload);
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

  /**
   * Разослать сообщение ВСЕМ онлайн-соединениям (все пользователи, все вкладки).
   * Используется для мгновенного применения рантайм-эффектов вроде тех.работ.
   */
  broadcastAll(msg: UserS2C): void {
    for (const set of this.conns.values()) {
      for (const c of set) {
        if (c.isOpen()) c.send(msg);
      }
    }
  }

  /** Принудительно переразослать презенс (после смены настроек приватности). */
  republishPresence(userId: string): void {
    void this.broadcastPresence(userId);
  }

  /** Загрузить online-правило приватности (дефолт — видно всем). */
  private async onlineRule(userId: string): Promise<PrivacyRule> {
    if (!this.onlinePrivacyResolver) return DEFAULT_PRIVACY_RULE;
    try {
      return await this.onlinePrivacyResolver(userId);
    } catch (err) {
      logger.error({ err, userId }, 'presence: privacy resolver failed');
      return DEFAULT_PRIVACY_RULE;
    }
  }

  /** Презенс владельца глазами зрителя: скрытый онлайн отдаём как «офлайн». */
  private gate(
    ownerId: string,
    raw: FriendPresence,
    rule: PrivacyRule,
    viewerId: string,
    isFriend: boolean,
  ): FriendPresence {
    const visible = canSee(rule, { isSelf: viewerId === ownerId, isFriend, viewerId });
    if (visible) return raw;
    return { userId: ownerId, online: false, currentRoom: null, lastSeenAt: null };
  }

  /** Отдать одному подписчику текущий презенс цели с учётом приватности. */
  private async sendGatedPresence(conn: UserConnection, targetId: string): Promise<void> {
    if (!conn.isOpen()) return;
    const raw = this.presenceOf(targetId);
    const rule = await this.onlineRule(targetId);
    let isFriend = false;
    if (conn.userId !== targetId && this.friendResolver) {
      try {
        const ids = await this.friendResolver(targetId);
        isFriend = ids.includes(conn.userId);
      } catch {
        /* при ошибке считаем не-другом — безопаснее скрыть */
      }
    }
    if (!conn.isOpen()) return;
    conn.send({ t: 'presence', presence: this.gate(targetId, raw, rule, conn.userId, isFriend) });
  }

  /** Разослать обновлённое присутствие его онлайн-друзьям и подписчикам. */
  private async broadcastPresence(userId: string): Promise<void> {
    const raw = this.presenceOf(userId);
    const rule = await this.onlineRule(userId);

    let friendIds: string[] = [];
    if (this.friendResolver) {
      try {
        friendIds = await this.friendResolver(userId);
      } catch (err) {
        logger.error({ err, userId }, 'presence: friend resolver failed');
      }
    }
    const friendSet = new Set(friendIds);

    // Друзья: видят гейтнутый презенс (isFriend = true).
    for (const fid of friendIds) {
      this.pushTo(fid, { t: 'presence', presence: this.gate(userId, raw, rule, fid, true) });
    }

    // Подписчики на профиль (/u/:username), не являющиеся друзьями: гейтим как
    // посторонних. Друзей среди них уже оповестил pushTo выше — не дублируем.
    const watchers = this.watchersOf.get(userId);
    if (watchers) {
      for (const c of watchers) {
        if (!c.isOpen() || friendSet.has(c.userId)) continue;
        c.send({ t: 'presence', presence: this.gate(userId, raw, rule, c.userId, false) });
      }
    }
  }
}

export const userHub = new UserHub();
