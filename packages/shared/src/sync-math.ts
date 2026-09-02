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
    // If client is behind (drift < 0), speed up slightly (1.08x)
    // If client is ahead (drift > 0), slow down slightly (0.92x)
    const factor = driftSeconds < 0 ? 1.08 : 0.92;
    const targetRate = Number((currentPlaybackRate * factor).toFixed(2));
    return { type: 'RATE_ADJUST', targetRate, driftMs };
  }

  // Tier 3: Hard seek (> 1000ms)
  return { type: 'HARD_SEEK', targetTime: expectedTimeSeconds, driftMs };
}
