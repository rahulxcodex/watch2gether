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

export class LatencyAnomalyDetector {
  private window: number[] = [];

  constructor(
    public readonly windowSize = 30,
    public readonly zThreshold = 2.5
  ) {
    if (windowSize < 3) {
      throw new Error('Window size must be at least 3');
    }
  }

  public addSample(value: number): AnomalyResult {
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

  public getStats(): { mean: number; stdDev: number; count: number } {
    const n = this.window.length;
    if (n === 0) return { mean: 0, stdDev: 0, count: 0 };
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

  public reset(): void {
    this.window = [];
  }
}
