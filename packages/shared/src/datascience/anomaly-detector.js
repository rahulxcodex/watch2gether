"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LatencyAnomalyDetector = void 0;
class LatencyAnomalyDetector {
    windowSize;
    zThreshold;
    window = [];
    constructor(windowSize = 30, zThreshold = 2.5) {
        this.windowSize = windowSize;
        this.zThreshold = zThreshold;
        if (windowSize < 3) {
            throw new Error('Window size must be at least 3');
        }
    }
    addSample(value) {
        this.window.push(value);
        if (this.window.length > this.windowSize) {
            this.window.shift();
        }
        if (this.window.length < 5) {
            return { isAnomaly: false, zScore: 0, mean: value, stdDev: 0 };
        }
        const n = this.window.length;
        const mean = this.window.reduce((acc, v) => acc + v, 0) / n;
        const variance = this.window.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (n - 1);
        const stdDev = Math.sqrt(variance);
        const effectiveStdDev = Math.max(stdDev, 2.0);
        const zScore = (value - mean) / effectiveStdDev;
        const isAnomaly = Math.abs(zScore) >= this.zThreshold;
        return {
            isAnomaly,
            zScore: Number(zScore.toFixed(3)),
            mean: Number(mean.toFixed(2)),
            stdDev: Number(stdDev.toFixed(2)),
        };
    }
    getStats() {
        const n = this.window.length;
        if (n === 0)
            return { mean: 0, stdDev: 0, count: 0 };
        const mean = this.window.reduce((a, b) => a + b, 0) / n;
        const variance = n > 1
            ? this.window.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (n - 1)
            : 0;
        return {
            mean: Number(mean.toFixed(2)),
            stdDev: Number(Math.sqrt(variance).toFixed(2)),
            count: n,
        };
    }
    reset() {
        this.window = [];
    }
}
exports.LatencyAnomalyDetector = LatencyAnomalyDetector;
//# sourceMappingURL=anomaly-detector.js.map