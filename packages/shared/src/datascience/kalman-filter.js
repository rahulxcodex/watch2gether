"use strict";
/**
 * Kalman Filter Implementations
 * 1. 1D Scalar Kalman Filter for single variable state estimation.
 * 2. 2D Clock Kalman Filter estimating offset (theta) and drift velocity (theta_dot).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClockKalmanFilter = exports.KalmanFilter1D = void 0;
class KalmanFilter1D {
    x; // State estimate
    p; // Error covariance
    q; // Process noise covariance
    r; // Measurement noise covariance
    constructor(initialEstimate = 0, initialError = 100, processNoise = 0.05, measurementNoise = 5.0) {
        this.x = initialEstimate;
        this.p = initialError;
        this.q = processNoise;
        this.r = measurementNoise;
    }
    update(measurement, measurementNoise) {
        const r = measurementNoise ?? this.r;
        // Prediction step
        this.p += this.q;
        // Measurement update step
        const k = this.p / (this.p + r); // Kalman gain
        this.x += k * (measurement - this.x);
        this.p *= (1 - k);
        return this.x;
    }
    get estimate() {
        return this.x;
    }
}
exports.KalmanFilter1D = KalmanFilter1D;
class ClockKalmanFilter {
    // State vector [offset, driftRate]
    offset = 0;
    driftRate = 0;
    // Covariance matrix P
    p00 = 1000;
    p01 = 0;
    p10 = 0;
    p11 = 1000;
    // Process noise Q
    qOffset = 0.01;
    qDrift = 0.001;
    // Measurement noise R
    baseR = 100;
    constructor(initialOffset = 0) {
        this.offset = initialOffset;
    }
    /**
     * Time update (predict step) given elapsed seconds dt
     */
    predict(dtSeconds) {
        if (dtSeconds <= 0)
            return;
        // State extrapolation: offset_new = offset + dt * driftRate
        this.offset += dtSeconds * this.driftRate;
        // Covariance extrapolation: P_new = F * P * F^T + Q
        // F = [[1, dt], [0, 1]]
        const p00Next = this.p00 + dtSeconds * (this.p10 + this.p01) + dtSeconds * dtSeconds * this.p11 + this.qOffset;
        const p01Next = this.p01 + dtSeconds * this.p11;
        const p10Next = this.p10 + dtSeconds * this.p11;
        const p11Next = this.p11 + this.qDrift;
        this.p00 = p00Next;
        this.p01 = p01Next;
        this.p10 = p10Next;
        this.p11 = p11Next;
    }
    /**
     * Measurement update with new observed offset and observed RTT
     */
    update(measuredOffset, rttMs) {
        // Dynamic measurement variance proportional to RTT
        const r = Math.max(10, Math.pow(rttMs / 2, 2) + this.baseR);
        // Innovation (measurement residual)
        const y = measuredOffset - this.offset;
        // Innovation covariance: S = H * P * H^T + R = P00 + R (since H = [1, 0])
        const s = this.p00 + r;
        // Kalman gain: K = P * H^T / S = [P00 / S, P10 / S]^T
        const k0 = this.p00 / s;
        const k1 = this.p10 / s;
        // Update state estimate
        this.offset += k0 * y;
        this.driftRate += k1 * y;
        // Update error covariance: P = (I - K * H) * P
        const p00Update = (1 - k0) * this.p00;
        const p01Update = (1 - k0) * this.p01;
        const p10Update = this.p10 - k1 * this.p00;
        const p11Update = this.p11 - k1 * this.p01;
        this.p00 = p00Update;
        this.p01 = p01Update;
        this.p10 = p10Update;
        this.p11 = p11Update;
        return {
            offset: Math.round(this.offset),
            driftRate: Number(this.driftRate.toFixed(4)),
        };
    }
    get currentOffset() {
        return Math.round(this.offset);
    }
    get currentDriftRate() {
        return this.driftRate;
    }
}
exports.ClockKalmanFilter = ClockKalmanFilter;
//# sourceMappingURL=kalman-filter.js.map