import type { RoomRuntime } from './RoomRuntime.js';

class RoomStore {
  private readonly rooms = new Map<string, RoomRuntime>();

  get(roomId: string): RoomRuntime | undefined {
    return this.rooms.get(roomId);
  }

  set(roomId: string, runtime: RoomRuntime): void {
    this.rooms.set(roomId, runtime);
  }

  delete(roomId: string): void {
    this.rooms.delete(roomId);
  }

  values(): IterableIterator<RoomRuntime> {
    return this.rooms.values();
  }

  /** Все активные runtimes (для админ-статистики и broadcast). */
  list(): RoomRuntime[] {
    return [...this.rooms.values()];
  }

  /**
   * «Совместное время»: если два пользователя прямо сейчас вместе в какой-то
   * комнате — момент (ms) начала их текущего совместного интервала, иначе null.
   * Пользователь может быть максимум в одной комнате, так что достаточно найти
   * первую комнату с обоими.
   */
  coWatchAnchor(a: string, b: string): number | null {
    for (const rt of this.rooms.values()) {
      const since = rt.coWatchAnchor(a, b);
      if (since !== null) return since;
    }
    return null;
  }

  /** Закрыть все сессии конкретного пользователя во всех комнатах. */
  closeUserSessionsEverywhere(userId: string, reason: 'blocked' | 'deleted'): number {
    let closed = 0;
    for (const rt of this.rooms.values()) {
      if (rt.closeUserSessions(userId, reason)) closed += 1;
    }
    return closed;
  }

  /**
   * Закрыть все активные комнаты (режим обслуживания): отключает всех участников
   * и, как следствие рвущихся сокетов, завершает идущие звонки. Возвращает число
   * отключённых участников.
   */
  closeAllRooms(byAdminUserId: string): number {
    let disconnected = 0;
    for (const rt of this.rooms.values()) {
      disconnected += rt.forceClose(byAdminUserId);
    }
    return disconnected;
  }
}

export const roomStore = new RoomStore();
