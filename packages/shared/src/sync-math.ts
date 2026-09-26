import type { PlaybackStatus } from './types';

export interface SyncSample {
  rtt: number;                // Round trip time in ms
  offset: number;             // Calculated theta (server - client) in ms
  clientTimestamp: number;    // T4 timestamp (client receive time)
  serverTimestamp: number;    // T2 timestamp (server time)
}

export interface ClockSyncState {
  samples: SyncSample[];      // Window of recent samples (max capacity e.g. 10)
  estimatedOffset: number;    // Filtered authoritative theta in ms
  minRtt: number;             // Best recorded round trip time in ms
  lastSyncTimestamp: number;  // Local client timestamp of last successful sync
}

export type ReconciliationAction = 
  | { type: 'NONE'; reason: 'WITHIN_DEADBAND'; driftMs: number }
  | { type: 'RATE_ADJUST'; targetRate: number; driftMs: number }
  | { type: 'HARD_SEEK'; targetTime: number; driftMs: number };

/**
 * Calculates clock offset (theta) and round trip time from a sync pong exchange using Cristian's algorithm.
 * 
 * T1: clientSendTime
 * T2: serverTime
 * T4: clientReceiveTime
 * RTT = T4 - T1
 * Theta = T2 - (T1 + RTT / 2) = T2 - (T1 + T4) / 2
 */
export function calculateSyncSample(
  clientSendTime: number,
  serverTime: number,
  clientReceiveTime: number
): SyncSample {
  const rtt = Math.max(0, clientReceiveTime - clientSendTime);
  const offset = Math.round(serverTime - (clientSendTime + rtt / 2));
  return {
    rtt,
    offset,
    clientTimestamp: clientReceiveTime,
    serverTimestamp: serverTime,
  };
}

/**
 * Filters sample window and derives filtered clock offset using lowest-RTT selection and EMA smoothing.
 */
export function deriveAuthoritativeOffset(
  samples: SyncSample[],
  previousOffset: number = 0,
  smoothingAlpha: number = 0.7
): { offset: number; bestRtt: number } {
  if (samples.length === 0) {
    return { offset: previousOffset, bestRtt: 0 };
  }

  // Sort by RTT ascending to find lowest network latency sample
  const sortedByRtt = [...samples].sort((a, b) => a.rtt - b.rtt);
  const bestSample = sortedByRtt[0];

  if (samples.length === 1) {
    return { offset: bestSample.offset, bestRtt: bestSample.rtt };
  }

  // Compute Exponential Moving Average (EMA) with previous offset
  const smoothedOffset = Math.round(
    smoothingAlpha * bestSample.offset + (1 - smoothingAlpha) * previousOffset
  );

  return {
    offset: smoothedOffset,
    bestRtt: bestSample.rtt,
  };
}

/**
 * Projects expected video playback time at a given client timestamp.
 */
export function projectPlaybackTime(
  state: {
    status?: PlaybackStatus;
    state?: PlaybackStatus;
    currentTime: number;
    serverTimestamp: number;
    playbackRate?: number;
    duration?: number;
  },
  clientCurrentTime: number,
  clockOffsetTheta: number
): number {
  const playbackStatus = state.status || state.state || 'IDLE';
  if (playbackStatus !== 'PLAYING') {
    return Math.max(0, state.currentTime);
  }

  const rate = state.playbackRate ?? 1.0;
  const currentServerTime = clientCurrentTime + clockOffsetTheta;
  const elapsedMs = currentServerTime - state.serverTimestamp;
  const elapsedSeconds = Math.max(0, elapsedMs / 1000);

  let projected = state.currentTime + elapsedSeconds * rate;

  if (state.duration !== undefined && state.duration > 0) {
    projected = Math.min(projected, state.duration);
  }

  return Math.max(0, projected);
}

/**
 * Evaluates the required 3-tier reconciliation action given local player position and expected authoritative position.
 * Tier 1: <= 150ms -> Deadband (Ignore)
 * Tier 2: 150ms to 1000ms -> Soft Rate Correction (1.08x catchup / 0.92x slow down)
 * Tier 3: > 1000ms -> Hard Seek
 */
export function evaluateDriftAction(
  localTimeSeconds: number,
  expectedTimeSeconds: number,
  currentPlaybackRate: number = 1.0
): ReconciliationAction {
  const driftSeconds = localTimeSeconds - expectedTimeSeconds;
  const driftMs = Math.round(driftSeconds * 1000);
  const absDriftMs = Math.abs(driftMs);

  // Tier 1: Deadband (<= 150ms)
  if (absDriftMs <= 150) {
    return { type: 'NONE', reason: 'WITHIN_DEADBAND', driftMs };
  }

  // Tier 2: Micro-rate adjustment (150ms to 1000ms)
  if (absDriftMs <= 1000) {
    const factor = driftSeconds < 0 ? 1.08 : 0.92;
    const baseRate = (Math.abs(currentPlaybackRate - 1.08) < 0.01 || Math.abs(currentPlaybackRate - 0.92) < 0.01)
      ? 1.0
      : currentPlaybackRate;
    const targetRate = Number((baseRate * factor).toFixed(2));
    return { type: 'RATE_ADJUST', targetRate, driftMs };
  }

  // Tier 3: Hard seek (> 1000ms)
  return { type: 'HARD_SEEK', targetTime: expectedTimeSeconds, driftMs };
}

/**
 * Filters outlier NTP sync samples using Interquartile Range (IQR).
 * Discards samples where RTT is outside [Q1 - 1.5*IQR, Q3 + 1.5*IQR].
 */
export function filterOutliersIQR(samples: SyncSample[]): SyncSample[] {
  if (samples.length < 4) {
    return samples;
  }

  const sorted = [...samples].sort((a, b) => a.rtt - b.rtt);
  const n = sorted.length;
  const q1Index = Math.floor(n * 0.25);
  const q3Index = Math.floor(n * 0.75);

  const q1 = sorted[q1Index]!.rtt;
  const q3 = sorted[q3Index]!.rtt;
  const iqr = q3 - q1;

  if (iqr === 0) return samples;

  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  const filtered = samples.filter((s) => s.rtt >= lowerBound && s.rtt <= upperBound);
  return filtered.length > 0 ? filtered : samples;
}

/**
 * Computes an adaptive EMA smoothing factor (alpha) based on RTT jitter (std dev).
 * On noisy connections with high jitter, alpha scales down to prevent jitter contamination.
 */
export function adaptiveAlpha(rttSamples: number[], baseAlpha = 0.7, k = 0.01): number {
  const n = rttSamples.length;
  if (n < 3) return baseAlpha;

  const mean = rttSamples.reduce((a, b) => a + b, 0) / n;
  const variance = rttSamples.reduce((a, x) => a + Math.pow(x - mean, 2), 0) / (n - 1);
  const stdDev = Math.sqrt(variance);

  const alpha = baseAlpha / (1 + k * stdDev);
  return Number(Math.max(0.1, Math.min(0.95, alpha)).toFixed(3));
}

/**
 * Derives clock offset with IQR outlier filtering and dynamic jitter-adaptive EMA smoothing.
 */
export function deriveAuthoritativeOffsetAdaptive(
  samples: SyncSample[],
  previousOffset: number = 0,
  baseAlpha: number = 0.7
): { offset: number; bestRtt: number; usedAlpha: number } {
  if (samples.length === 0) {
    return { offset: previousOffset, bestRtt: 0, usedAlpha: baseAlpha };
  }

  // 1. Filter anomalous RTT spikes with IQR
  const cleanedSamples = filterOutliersIQR(samples);

  // 2. Sort by RTT ascending to select lowest latency sample
  const sorted = [...cleanedSamples].sort((a, b) => a.rtt - b.rtt);
  const bestSample = sorted[0]!;

  if (samples.length === 1) {
    return { offset: bestSample.offset, bestRtt: bestSample.rtt, usedAlpha: baseAlpha };
  }

  // 3. Compute dynamic alpha from RTT jitter
  const rtts = samples.map((s) => s.rtt);
  const effectiveAlpha = adaptiveAlpha(rtts, baseAlpha);

  const smoothedOffset = Math.round(
    effectiveAlpha * bestSample.offset + (1 - effectiveAlpha) * previousOffset
  );

  return {
    offset: smoothedOffset,
    bestRtt: bestSample.rtt,
    usedAlpha: effectiveAlpha,
  };
}

/**
 * Binary search to find the nearest buffered playback position.
 * Prevents video stalls during hard seek by snapping to pre-buffered frames if within tolerance.
 */
export function findNearestBufferedTime(
  bufferedRanges: Array<{ start: number; end: number }>,
  targetTime: number,
  maxToleranceSeconds = 2.0
): number {
  if (bufferedRanges.length === 0) return targetTime;

  // Check if target is already inside any buffered segment
  for (const range of bufferedRanges) {
    if (targetTime >= range.start && targetTime <= range.end) {
      return targetTime;
    }
  }

  // Binary search for nearest boundary
  let low = 0;
  let high = bufferedRanges.length - 1;
  let bestTime = targetTime;
  let bestDistance = Infinity;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const range = bufferedRanges[mid]!;

    const distToStart = Math.abs(targetTime - range.start);
    const distToEnd = Math.abs(targetTime - range.end);
    const closestInSegment = distToStart < distToEnd ? range.start : range.end;
    const distance = Math.min(distToStart, distToEnd);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestTime = closestInSegment;
    }

    if (targetTime < range.start) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return bestDistance <= maxToleranceSeconds ? bestTime : targetTime;
}

