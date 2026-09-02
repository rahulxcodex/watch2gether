import { describe, it, expect } from 'vitest';
import {
  calculateSyncSample,
  deriveAuthoritativeOffset,
  projectPlaybackTime,
  evaluateDriftAction,
  type SyncSample
} from '../sync-math';

describe('Sync Math Empirical & Adversarial Stress Tests', () => {
  describe('High Clock Skew Scenarios', () => {
    const skewScenarios = [
      { name: '+5000ms (Client ahead by 5s)', skewMs: -5000, clientSend: 10000, serverBase: 5000 },
      { name: '-5000ms (Client behind by 5s)', skewMs: 5000, clientSend: 5000, serverBase: 10000 },
      { name: '+60000ms (Client ahead by 1min)', skewMs: -60000, clientSend: 70000, serverBase: 10000 },
      { name: '-60000ms (Client behind by 1min)', skewMs: 60000, clientSend: 10000, serverBase: 70000 },
      { name: '+86400000ms (Client ahead by 1 day)', skewMs: -86400000, clientSend: 96400000, serverBase: 10000000 },
      { name: '-86400000ms (Client behind by 1 day)', skewMs: 86400000, clientSend: 10000000, serverBase: 96400000 },
    ];

    skewScenarios.forEach(({ name, skewMs, clientSend, serverBase }) => {
      it(`should compute exact offset for skew scenario: ${name}`, () => {
        // Symmetric one-way delay of 25ms (RTT = 50ms)
        const owd = 25;
        const serverTime = serverBase + owd;
        const clientReceive = clientSend + owd * 2; // RTT = 50ms

        const sample = calculateSyncSample(clientSend, serverTime, clientReceive);
        expect(sample.rtt).toBe(50);
        expect(sample.offset).toBe(skewMs);

        // Verify authoritative offset derivation with window
        const window: SyncSample[] = [sample];
        const derived = deriveAuthoritativeOffset(window, 0);
        expect(derived.offset).toBe(skewMs);
        expect(derived.bestRtt).toBe(50);

        // Verify playhead projection remains completely consistent across skews
        const serverState = {
          status: 'PLAYING' as const,
          currentTime: 100.0,
          serverTimestamp: serverTime,
          playbackRate: 1.0,
        };

        // Client evaluates playback 3 seconds later in its local clock
        const clientEvalTime = clientReceive + 3000;
        const projected = projectPlaybackTime(serverState, clientEvalTime, derived.offset);

        // Expected elapsed time on server = (clientEvalTime + skewMs - serverTime) / 1000
        // clientReceive = clientSend + 50
        // clientEvalTime = clientSend + 3050
        // clientEvalTime + skewMs = serverBase + 3050
        // serverTime = serverBase + 25
        // elapsed = (serverBase + 3050 - (serverBase + 25)) = 3025ms = 3.025s
        // projected = 100.0 + 3.025 = 103.025s
        expect(projected).toBeCloseTo(103.025, 3);
      });
    });
  });

  describe('High Jitter and Stochastic Latency Simulation (1,000 Rounds)', () => {
    it('should filter jitter spikes and converge within <15ms error under bimodal latency (10ms - 400ms)', () => {
      const trueSkew = 3450; // Server is 3450ms ahead of client
      const samples: SyncSample[] = [];
      let previousEstimatedOffset = 0;
      const windowSize = 10;
      const errors: number[] = [];

      // Run 1000 simulated NTP exchanges
      for (let i = 0; i < 1000; i++) {
        const clientSend = 100000 + i * 1000;
        // Bimodal latency: 80% fast (10ms-30ms RTT), 20% buffer-bloat spike (200ms-400ms RTT)
        const isSpike = Math.random() < 0.2;
        const owdUplink = isSpike ? 100 + Math.random() * 100 : 5 + Math.random() * 10;
        const owdDownlink = isSpike ? 100 + Math.random() * 100 : 5 + Math.random() * 10;

        const serverTime = clientSend + trueSkew + owdUplink;
        const clientReceive = clientSend + owdUplink + owdDownlink;

        const sample = calculateSyncSample(clientSend, serverTime, clientReceive);
        samples.push(sample);
        if (samples.length > windowSize) {
          samples.shift();
        }

        const derived = deriveAuthoritativeOffset(samples, previousEstimatedOffset, 0.7);
        previousEstimatedOffset = derived.offset;

        // Track error after warm-up (first 10 samples)
        if (i >= 10) {
          errors.push(Math.abs(derived.offset - trueSkew));
        }
      }

      // Statistical analysis
      errors.sort((a, b) => a - b);
      const p50 = errors[Math.floor(errors.length * 0.5)];
      const p95 = errors[Math.floor(errors.length * 0.95)];
      const p99 = errors[Math.floor(errors.length * 0.99)];
      const maxError = errors[errors.length - 1];
      const meanError = errors.reduce((sum, val) => sum + val, 0) / errors.length;

      // Assert that lowest-RTT selection successfully shields against 400ms spikes
      expect(p50).toBeLessThanOrEqual(10); // median error <= 10ms
      expect(p95).toBeLessThanOrEqual(15); // 95th percentile error <= 15ms
      expect(meanError).toBeLessThanOrEqual(10);
      expect(maxError).toBeLessThanOrEqual(50);
    });

    it('should maintain stable offset during a 3-packet network outage / extreme spike (1500ms RTT)', () => {
      const trueSkew = -1200;
      const samples: SyncSample[] = [];
      let previousOffset = 0;

      // Initial clean samples (RTT ~ 20ms) with progressive warm-up
      for (let i = 0; i < 7; i++) {
        const clientSend = 50000 + i * 500;
        const serverTime = clientSend + trueSkew + 10;
        const clientReceive = clientSend + 20;
        const sample = calculateSyncSample(clientSend, serverTime, clientReceive);
        samples.push(sample);
        const derived = deriveAuthoritativeOffset(samples, previousOffset, 0.7);
        previousOffset = derived.offset;
      }

      expect(previousOffset).toBe(trueSkew);

      // Inject 3 massive spikes (1500ms RTT with severe asymmetry)
      for (let i = 0; i < 3; i++) {
        const clientSend = 60000 + i * 500;
        const serverTime = clientSend + trueSkew + 1200; // asymmetric uplink 1200ms
        const clientReceive = clientSend + 1500;
        samples.push(calculateSyncSample(clientSend, serverTime, clientReceive));
        if (samples.length > 10) samples.shift();

        const spikedDerived = deriveAuthoritativeOffset(samples, previousOffset, 0.7);
        previousOffset = spikedDerived.offset;
      }

      // Because the window still contains clean samples (RTT=20ms), the lowest RTT sample is chosen
      expect(previousOffset).toBe(trueSkew);
    });
  });

  describe('Adversarial Mathematical Boundaries & Edge Cases', () => {
    it('should handle zero, negative, and infinite playback rates safely', () => {
      const baseState = {
        status: 'PLAYING' as const,
        currentTime: 50.0,
        serverTimestamp: 10000,
        duration: 120.0,
      };

      // PlaybackRate = 0
      const zeroRate = projectPlaybackTime({ ...baseState, playbackRate: 0 }, 15000, 0);
      expect(zeroRate).toBe(50.0);

      // Negative playback rate (reverse)
      const negRate = projectPlaybackTime({ ...baseState, playbackRate: -1.0 }, 15000, 0);
      // 50 + 5 * (-1) = 45.0
      expect(negRate).toBe(45.0);

      // Large negative that would go below 0 -> clamped to 0
      const extremeNeg = projectPlaybackTime({ ...baseState, playbackRate: -20.0 }, 15000, 0);
      expect(extremeNeg).toBe(0);
    });

    it('should handle past/negative client elapsed times without invalid output', () => {
      const state = {
        status: 'PLAYING' as const,
        currentTime: 10.0,
        serverTimestamp: 20000,
      };

      // Client time is before serverTimestamp (e.g. state sent in future or clock drifted)
      // Math.max(0, elapsedMs / 1000) prevents negative elapsed time
      const projected = projectPlaybackTime(state, 15000, 0);
      expect(projected).toBe(10.0);
    });

    it('should strictly partition 3-tier drift reconciliation matrix on exact boundaries', () => {
      // Boundaries: 150ms and 1000ms
      const exact150Lag = evaluateDriftAction(9.85, 10.00); // drift = -150ms
      expect(exact150Lag.type).toBe('NONE');
      expect(exact150Lag.driftMs).toBe(-150);

      const exact150Lead = evaluateDriftAction(10.15, 10.00); // drift = +150ms
      expect(exact150Lead.type).toBe('NONE');
      expect(exact150Lead.driftMs).toBe(150);

      const justAbove150Lag = evaluateDriftAction(9.849, 10.00); // drift = -151ms
      expect(justAbove150Lag.type).toBe('RATE_ADJUST');
      if (justAbove150Lag.type === 'RATE_ADJUST') {
        expect(justAbove150Lag.targetRate).toBe(1.08);
      }

      const justAbove150Lead = evaluateDriftAction(10.151, 10.00); // drift = +151ms
      expect(justAbove150Lead.type).toBe('RATE_ADJUST');
      if (justAbove150Lead.type === 'RATE_ADJUST') {
        expect(justAbove150Lead.targetRate).toBe(0.92);
      }

      const exact1000Lag = evaluateDriftAction(9.00, 10.00); // drift = -1000ms
      expect(exact1000Lag.type).toBe('RATE_ADJUST');

      const justAbove1000Lag = evaluateDriftAction(8.999, 10.00); // drift = -1001ms
      expect(justAbove1000Lag.type).toBe('HARD_SEEK');
      if (justAbove1000Lag.type === 'HARD_SEEK') {
        expect(justAbove1000Lag.targetTime).toBe(10.00);
      }
    });
  });
});
