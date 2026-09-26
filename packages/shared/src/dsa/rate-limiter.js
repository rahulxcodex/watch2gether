"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SlidingWindowRateLimiter = void 0;
/**
 * Sliding Window Deque Rate Limiter
 * Provides smooth, burst-tolerant rate limiting without fixed-window boundary spikes.
 */
class SlidingWindowRateLimiter {
    maxRequests;
    windowMs;
    timestamps = [];
    constructor(maxRequests, windowMs) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
        if (maxRequests <= 0 || windowMs <= 0) {
            throw new Error('maxRequests and windowMs must be greater than zero');
        }
    }
    allow(now = Date.now()) {
        const windowStart = now - this.windowMs;
        // Fast eviction of timestamps outside window
        while (this.timestamps.length > 0 && this.timestamps[0] <= windowStart) {
            this.timestamps.shift();
        }
        if (this.timestamps.length >= this.maxRequests) {
            return false;
        }
        this.timestamps.push(now);
        return true;
    }
    getCurrentCount(now = Date.now()) {
        const windowStart = now - this.windowMs;
        while (this.timestamps.length > 0 && this.timestamps[0] <= windowStart) {
            this.timestamps.shift();
        }
        return this.timestamps.length;
    }
    reset() {
        this.timestamps = [];
    }
}
exports.SlidingWindowRateLimiter = SlidingWindowRateLimiter;
//# sourceMappingURL=rate-limiter.js.map