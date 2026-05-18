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
}

export const roomStore = new RoomStore();
