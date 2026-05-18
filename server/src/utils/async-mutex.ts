/**
 * Lightweight per-key promise queue. All callers for a given key are serialized
 * through a single Promise chain — guaranteeing atomic mutations to the
 * authoritative room state without needing an external locking primitive.
 */
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<unknown>>();

  async run<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const ticket = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.tails.set(
      key,
      previous.then(() => ticket),
    );
    try {
      await previous;
      return await fn();
    } finally {
      release();
      // Allow GC: if no other waiters chained on top, clear the entry.
      if (this.tails.get(key) === ticket) {
        this.tails.delete(key);
      }
    }
  }
}

export const roomMutex = new KeyedMutex();
