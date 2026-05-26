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

  /** Сколько уникальных userId сейчас имеют живые сессии во всех комнатах. */
  countOnlineUsers(): number {
    const ids = new Set<string>();
    for (const rt of this.rooms.values()) {
      for (const userId of rt.participants.keys()) {
        ids.add(userId);
      }
    }
    return ids.size;
  }

  /** Закрыть все сессии конкретного пользователя во всех комнатах. */
  closeUserSessionsEverywhere(userId: string, reason: 'blocked' | 'deleted'): number {
    let closed = 0;
    for (const rt of this.rooms.values()) {
      if (rt.closeUserSessions(userId, reason)) closed += 1;
    }
    return closed;
  }
}

export const roomStore = new RoomStore();
