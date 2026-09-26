/**
 * Sliding Window Deque Rate Limiter
 * Provides smooth, burst-tolerant rate limiting without fixed-window boundary spikes.
 */
export declare class SlidingWindowRateLimiter {
    readonly maxRequests: number;
    readonly windowMs: number;
    private timestamps;
    constructor(maxRequests: number, windowMs: number);
    allow(now?: number): boolean;
    getCurrentCount(now?: number): number;
    reset(): void;
}
//# sourceMappingURL=rate-limiter.d.ts.map