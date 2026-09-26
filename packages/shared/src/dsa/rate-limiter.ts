/**
 * Sliding Window Deque Rate Limiter
 * Provides smooth, burst-tolerant rate limiting without fixed-window boundary spikes.
 */
export class SlidingWindowRateLimiter {
  private timestamps: number[] = [];

  constructor(
    public readonly maxRequests: number,
    public readonly windowMs: number
  ) {
    if (maxRequests <= 0 || windowMs <= 0) {
      throw new Error('maxRequests and windowMs must be greater than zero');
    }
  }

  public allow(now = Date.now()): boolean {
    const windowStart = now - this.windowMs;

    // Fast eviction of timestamps outside window
    while (this.timestamps.length > 0 && this.timestamps[0]! <= windowStart) {
      this.timestamps.shift();
    }

    if (this.timestamps.length >= this.maxRequests) {
      return false;
    }

    this.timestamps.push(now);
    return true;
  }

  public getCurrentCount(now = Date.now()): number {
    const windowStart = now - this.windowMs;
    while (this.timestamps.length > 0 && this.timestamps[0]! <= windowStart) {
      this.timestamps.shift();
    }
    return this.timestamps.length;
  }

  public reset(): void {
    this.timestamps = [];
  }
}
