import type { PlaybackStatus } from './types';
export interface SyncSample {
    rtt: number;
    offset: number;
    clientTimestamp: number;
    serverTimestamp: number;
}
export interface ClockSyncState {
    samples: SyncSample[];
    estimatedOffset: number;
    minRtt: number;
    lastSyncTimestamp: number;
}
export type ReconciliationAction = {
    type: 'NONE';
    reason: 'WITHIN_DEADBAND';
    driftMs: number;
} | {
    type: 'RATE_ADJUST';
    targetRate: number;
    driftMs: number;
} | {
    type: 'HARD_SEEK';
    targetTime: number;
    driftMs: number;
};
/**
 * Calculates clock offset (theta) and round trip time from a sync pong exchange using Cristian's algorithm.
 *
 * T1: clientSendTime
 * T2: serverTime
 * T4: clientReceiveTime
 * RTT = T4 - T1
 * Theta = T2 - (T1 + RTT / 2) = T2 - (T1 + T4) / 2
 */
export declare function calculateSyncSample(clientSendTime: number, serverTime: number, clientReceiveTime: number): SyncSample;
/**
 * Filters sample window and derives filtered clock offset using lowest-RTT selection and EMA smoothing.
 */
export declare function deriveAuthoritativeOffset(samples: SyncSample[], previousOffset?: number, smoothingAlpha?: number): {
    offset: number;
    bestRtt: number;
};
/**
 * Projects expected video playback time at a given client timestamp.
 */
export declare function projectPlaybackTime(state: {
    status?: PlaybackStatus;
    state?: PlaybackStatus;
    currentTime: number;
    serverTimestamp: number;
    playbackRate?: number;
    duration?: number;
}, clientCurrentTime: number, clockOffsetTheta: number): number;
/**
 * Evaluates the required 3-tier reconciliation action given local player position and expected authoritative position.
 * Tier 1: <= 150ms -> Deadband (Ignore)
 * Tier 2: 150ms to 1000ms -> Soft Rate Correction (1.08x catchup / 0.92x slow down)
 * Tier 3: > 1000ms -> Hard Seek
 */
export declare function evaluateDriftAction(localTimeSeconds: number, expectedTimeSeconds: number, currentPlaybackRate?: number): ReconciliationAction;
