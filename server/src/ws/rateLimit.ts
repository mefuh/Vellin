/**
 * Per-socket token bucket. 20 messages/sec by default with a burst of 30.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  consume(cost = 1): boolean {
    this.refill();
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }

  private refill(): void {
    const now = Date.now();
    const dt = (now - this.lastRefill) / 1000;
    if (dt <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + dt * this.refillPerSec);
    this.lastRefill = now;
  }
}
