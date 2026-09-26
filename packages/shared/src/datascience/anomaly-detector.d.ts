/**
 * Latency & Jitter Anomaly Detector
 * Uses Z-score statistical thresholding over a sliding window.
 */
export interface AnomalyResult {
    isAnomaly: boolean;
    zScore: number;
    mean: number;
    stdDev: number;
}
export declare class LatencyAnomalyDetector {
    readonly windowSize: number;
    readonly zThreshold: number;
    private window;
    constructor(windowSize?: number, zThreshold?: number);
    addSample(value: number): AnomalyResult;
    getStats(): {
        mean: number;
        stdDev: number;
        count: number;
    };
    reset(): void;
}
//# sourceMappingURL=anomaly-detector.d.ts.map