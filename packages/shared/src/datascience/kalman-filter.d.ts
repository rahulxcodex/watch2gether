/**
 * Kalman Filter Implementations
 * 1. 1D Scalar Kalman Filter for single variable state estimation.
 * 2. 2D Clock Kalman Filter estimating offset (theta) and drift velocity (theta_dot).
 */
export declare class KalmanFilter1D {
    private x;
    private p;
    private q;
    private r;
    constructor(initialEstimate?: number, initialError?: number, processNoise?: number, measurementNoise?: number);
    update(measurement: number, measurementNoise?: number): number;
    get estimate(): number;
}
export declare class ClockKalmanFilter {
    private offset;
    private driftRate;
    private p00;
    private p01;
    private p10;
    private p11;
    private qOffset;
    private qDrift;
    private baseR;
    constructor(initialOffset?: number);
    /**
     * Time update (predict step) given elapsed seconds dt
     */
    predict(dtSeconds: number): void;
    /**
     * Measurement update with new observed offset and observed RTT
     */
    update(measuredOffset: number, rttMs: number): {
        offset: number;
        driftRate: number;
    };
    get currentOffset(): number;
    get currentDriftRate(): number;
}
//# sourceMappingURL=kalman-filter.d.ts.map