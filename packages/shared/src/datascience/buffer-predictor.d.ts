/**
 * Predictive Buffering Model
 * Predicts buffer depletion time using linear extrapolation of download rate vs playback rate.
 */
export interface BufferPrediction {
    depletionTimeSeconds: number;
    willStallSoon: boolean;
    netDrainRate: number;
}
export declare function predictBufferExhaustion(currentBufferSeconds: number, downloadRateBytesPerSec: number, streamBitrateBytesPerSec: number, playbackRate?: number, warningThresholdSeconds?: number): BufferPrediction;
//# sourceMappingURL=buffer-predictor.d.ts.map