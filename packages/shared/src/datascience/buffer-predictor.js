"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.predictBufferExhaustion = predictBufferExhaustion;
function predictBufferExhaustion(currentBufferSeconds, downloadRateBytesPerSec, streamBitrateBytesPerSec, playbackRate = 1.0, warningThresholdSeconds = 4.0) {
    if (currentBufferSeconds <= 0) {
        return {
            depletionTimeSeconds: 0,
            willStallSoon: true,
            netDrainRate: playbackRate,
        };
    }
    // Content consumed per real second = playbackRate seconds of video
    // Content downloaded per real second = (downloadRate / bitrate) seconds of video
    const downloadBufferRate = streamBitrateBytesPerSec > 0
        ? downloadRateBytesPerSec / streamBitrateBytesPerSec
        : 1.0;
    // Net change in buffer (positive = filling, negative = draining)
    const netRate = downloadBufferRate - playbackRate;
    if (netRate >= 0) {
        return {
            depletionTimeSeconds: Infinity,
            willStallSoon: false,
            netDrainRate: 0,
        };
    }
    const netDrainRate = Math.abs(netRate);
    const depletionTimeSeconds = currentBufferSeconds / netDrainRate;
    return {
        depletionTimeSeconds: Number(depletionTimeSeconds.toFixed(2)),
        willStallSoon: depletionTimeSeconds < warningThresholdSeconds,
        netDrainRate: Number(netDrainRate.toFixed(3)),
    };
}
//# sourceMappingURL=buffer-predictor.js.map