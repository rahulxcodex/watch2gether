import { describe, it, expect } from 'vitest';
import {
  calculateSyncSample,
  deriveAuthoritativeOffset,
  projectPlaybackTime,
  evaluateDriftAction,
  type SyncSample
} from '../sync-math';

describe('NTP Clock Synchronization Math', () => {
  describe('calculateSyncSample', () => {
    it('should compute exact RTT and symmetric offset when clocks are synchronized', () => {
      // Client sends at T1=1000, Server receives & replies at T2=1050, Client receives at T4=1100
      const sample = calculateSyncSample(1000, 1050, 1100);
      expect(sample.rtt).toBe(100);
      // RTT/2 = 50. Offset = 1050 - (1000 + 50) = 0
      expect(sample.offset).toBe(0);
      expect(sample.clientTimestamp).toBe(1100);
      expect(sample.serverTimestamp).toBe(1050);
    });

    it('should compute positive offset when client clock is behind server', () => {
      // Client clock is 500ms behind server
      // T1=1000 (server time is 1500)
      // OWD=20ms -> T2=1520
      // OWD=20ms -> T4=1040
      const sample = calculateSyncSample(1000, 1520, 1040);
      expect(sample.rtt).toBe(40);
      expect(sample.offset).toBe(500);
    });

    it('should compute negative offset when client clock is ahead of server', () => {
      // Client clock is 300ms ahead of server
      // T1=1300 (server time is 1000)
      // OWD=25ms -> T2=1025
      // OWD=25ms -> T4=1350
      const sample = calculateSyncSample(1300, 1025, 1350);
      expect(sample.rtt).toBe(50);
      expect(sample.offset).toBe(-300);
    });

    it('should handle zero RTT gracefully', () => {
      const sample = calculateSyncSample(1000, 1000, 1000);
      expect(sample.rtt).toBe(0);
      expect(sample.offset).toBe(0);
    });
  });

  describe('deriveAuthoritativeOffset', () => {
    it('should return previous offset when no samples provided', () => {
      const result = deriveAuthoritativeOffset([], 42);
      expect(result.offset).toBe(42);
      expect(result.bestRtt).toBe(0);
    });

    it('should use single sample directly without smoothing', () => {
      const samples: SyncSample[] = [
        { rtt: 30, offset: 120, clientTimestamp: 1000, serverTimestamp: 1120 }
      ];
      const result = deriveAuthoritativeOffset(samples, 0);
      expect(result.offset).toBe(120);
      expect(result.bestRtt).toBe(30);
    });

    it('should select sample with lowest RTT and apply EMA smoothing', () => {
      const samples: SyncSample[] = [
        { rtt: 150, offset: 200, clientTimestamp: 1000, serverTimestamp: 1200 }, // High jitter
        { rtt: 20, offset: 100, clientTimestamp: 1050, serverTimestamp: 1150 },  // Best sample (RTT=20)
        { rtt: 80, offset: 130, clientTimestamp: 1100, serverTimestamp: 1230 },
      ];
      // previousOffset = 90, alpha = 0.7
      // expected = round(0.7 * 100 + 0.3 * 90) = round(70 + 27) = 97
      const result = deriveAuthoritativeOffset(samples, 90, 0.7);
      expect(result.bestRtt).toBe(20);
      expect(result.offset).toBe(97);
    });
  });

  describe('projectPlaybackTime', () => {
    it('should return unchanged currentTime when PAUSED or IDLE', () => {
      const pausedState = {
        status: 'PAUSED' as const,
        currentTime: 45.2,
        serverTimestamp: 10000,
        playbackRate: 1.0
      };
      // 5 seconds elapsed on client
      const projected = projectPlaybackTime(pausedState, 15000, 0);
      expect(projected).toBe(45.2);

      const idleState = {
        status: 'IDLE' as const,
        currentTime: 0,
        serverTimestamp: 10000
      };
      expect(projectPlaybackTime(idleState, 20000, 0)).toBe(0);
    });

    it('should project forward proportionally when PLAYING', () => {
      const playingState = {
        status: 'PLAYING' as const,
        currentTime: 10.0,
        serverTimestamp: 10000,
        playbackRate: 1.0
      };
      // Client time is 13000, clock offset is +500 (server time is 13500, elapsed = 3500ms = 3.5s)
      const projected = projectPlaybackTime(playingState, 13000, 500);
      expect(projected).toBeCloseTo(13.5, 3);
    });

    it('should respect custom playback rates', () => {
      const fastState = {
        status: 'PLAYING' as const,
        currentTime: 20.0,
        serverTimestamp: 10000,
        playbackRate: 1.5
      };
      // 4 seconds elapsed at 1.5x -> +6.0 seconds
      const projected = projectPlaybackTime(fastState, 14000, 0);
      expect(projected).toBeCloseTo(26.0, 3);
    });

    it('should clamp projected time to duration if provided', () => {
      const endState = {
        status: 'PLAYING' as const,
        currentTime: 95.0,
        serverTimestamp: 10000,
        playbackRate: 1.0,
        duration: 100.0
      };
      // 10 seconds elapsed -> would be 105, but clamped to 100
      const projected = projectPlaybackTime(endState, 20000, 0);
      expect(projected).toBe(100.0);
    });
  });

  describe('evaluateDriftAction (3-Tier Reconciliation Matrix)', () => {
    it('Tier 1: should return NONE when drift is within deadband (<= 150ms)', () => {
      // 50ms ahead
      const res1 = evaluateDriftAction(10.05, 10.00);
      expect(res1.type).toBe('NONE');
      expect(res1.driftMs).toBe(50);

      // 120ms behind
      const res2 = evaluateDriftAction(9.88, 10.00);
      expect(res2.type).toBe('NONE');
      expect(res2.driftMs).toBe(-120);

      // Exact 150ms boundary
      const res3 = evaluateDriftAction(10.15, 10.00);
      expect(res3.type).toBe('NONE');
    });

    it('Tier 2: should return RATE_ADJUST for drift between 150ms and 1000ms', () => {
      // Client is lagging by 300ms (drift = -300ms) -> speed up to catch up
      const lag = evaluateDriftAction(9.70, 10.00);
      expect(lag.type).toBe('RATE_ADJUST');
      if (lag.type === 'RATE_ADJUST') {
        expect(lag.targetRate).toBe(1.08);
        expect(lag.driftMs).toBe(-300);
      }

      // Client is leading by 400ms (drift = +400ms) -> slow down
      const lead = evaluateDriftAction(10.40, 10.00);
      expect(lead.type).toBe('RATE_ADJUST');
      if (lead.type === 'RATE_ADJUST') {
        expect(lead.targetRate).toBe(0.92);
        expect(lead.driftMs).toBe(400);
      }
    });

    it('Tier 3: should return HARD_SEEK for drift > 1000ms', () => {
      // Client is 2.5s behind
      const hardLag = evaluateDriftAction(7.5, 10.0);
      expect(hardLag.type).toBe('HARD_SEEK');
      if (hardLag.type === 'HARD_SEEK') {
        expect(hardLag.targetTime).toBe(10.0);
        expect(hardLag.driftMs).toBe(-2500);
      }

      // Client is 5s ahead
      const hardLead = evaluateDriftAction(15.0, 10.0);
      expect(hardLead.type).toBe('HARD_SEEK');
      if (hardLead.type === 'HARD_SEEK') {
        expect(hardLead.targetTime).toBe(10.0);
        expect(hardLead.driftMs).toBe(5000);
      }
    });
  });
});
