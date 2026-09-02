import { describe, it, expect } from "vitest";
import {
  calculateSyncSample,
  deriveAuthoritativeOffset,
  projectPlaybackTime,
  evaluateDriftAction,
  SYNC_CONSTANTS,
} from "@watch2gether/shared";

describe("Sync Engine - Cristian's Algorithm & NTP Offset", () => {
  it("should accurately calculate clock offset and RTT from ping/pong exchange", () => {
    const clientSend = 1000;
    const serverReceive = 1050; // Server is +30ms ahead of true time
    const clientReceive = 1040; // 40ms RTT -> 20ms one-way latency

    const sample = calculateSyncSample(clientSend, serverReceive, clientReceive);

    expect(sample.rtt).toBe(40);
    // Theta = 1050 - (1000 + 40/2) = 1050 - 1020 = +30ms
    expect(sample.offset).toBe(30);
  });

  it("should select lowest-RTT sample from sliding window", () => {
    const samples = [
      { rtt: 120, offset: 45, clientTimestamp: 1000, serverTimestamp: 1045 },
      { rtt: 30, offset: 25, clientTimestamp: 2000, serverTimestamp: 2025 }, // Best sample
      { rtt: 80, offset: 40, clientTimestamp: 3000, serverTimestamp: 3040 },
    ];

    const { offset, bestRtt } = deriveAuthoritativeOffset(samples, 0);

    expect(bestRtt).toBe(30);
    expect(offset).toBeGreaterThanOrEqual(15);
    expect(offset).toBeLessThanOrEqual(30);
  });
});

describe("Sync Engine - Authoritative Playhead Projection P(t)", () => {
  it("should project continuous playback time when status is PLAYING", () => {
    const state = {
      status: "PLAYING" as const,
      currentTime: 10.0,
      serverTimestamp: 100000,
      playbackRate: 1.0,
    };

    const clientTime = 102000; // 2 seconds later
    const clockTheta = 0; // in-sync clocks

    const projected = projectPlaybackTime(state, clientTime, clockTheta);
    expect(projected).toBeCloseTo(12.0, 2);
  });

  it("should account for playback rate and clock offset in playhead projection", () => {
    const state = {
      status: "PLAYING" as const,
      currentTime: 5.0,
      serverTimestamp: 100000,
      playbackRate: 1.5,
    };

    // Client local clock is at 99950, but theta = +50 -> server time is 100000 + 1000ms = 101000
    const clientTime = 100950;
    const clockTheta = 50;

    const projected = projectPlaybackTime(state, clientTime, clockTheta);
    // Elapsed = (100950 + 50 - 100000) / 1000 = 1.0s. At 1.5x -> 5.0 + 1.5 = 6.5s
    expect(projected).toBeCloseTo(6.5, 2);
  });

  it("should return static currentTime when status is PAUSED", () => {
    const state = {
      status: "PAUSED" as const,
      currentTime: 42.5,
      serverTimestamp: 100000,
      playbackRate: 1.0,
    };

    const clientTime = 150000; // 50 seconds later
    const clockTheta = 20;

    const projected = projectPlaybackTime(state, clientTime, clockTheta);
    expect(projected).toBe(42.5);
  });
});

describe("Sync Engine - 3-Tier Drift Reconciliation Logic", () => {
  it("Tier 1: should return NONE within deadband (<= 150ms)", () => {
    // 50ms drift ahead
    const action1 = evaluateDriftAction(10.05, 10.0, 1.0);
    expect(action1.type).toBe("NONE");
    expect(action1.driftMs).toBe(50);

    // 140ms drift behind
    const action2 = evaluateDriftAction(9.86, 10.0, 1.0);
    expect(action2.type).toBe("NONE");
    expect(action2.driftMs).toBe(-140);
  });

  it("Tier 2: should apply micro-rate catchup (1.08x) when client is behind (150ms to 1000ms)", () => {
    // Client at 9.6s, expected at 10.0s -> 400ms behind
    const action = evaluateDriftAction(9.6, 10.0, 1.0);
    expect(action.type).toBe("RATE_ADJUST");
    if (action.type === "RATE_ADJUST") {
      expect(action.targetRate).toBe(SYNC_CONSTANTS.RATE_FAST);
      expect(action.driftMs).toBe(-400);
    }
  });

  it("Tier 2: should apply micro-rate slowdown (0.92x) when client is ahead (150ms to 1000ms)", () => {
    // Client at 10.5s, expected at 10.0s -> 500ms ahead
    const action = evaluateDriftAction(10.5, 10.0, 1.0);
    expect(action.type).toBe("RATE_ADJUST");
    if (action.type === "RATE_ADJUST") {
      expect(action.targetRate).toBe(SYNC_CONSTANTS.RATE_SLOW);
      expect(action.driftMs).toBe(500);
    }
  });

  it("Tier 3: should trigger HARD_SEEK when drift exceeds 1000ms", () => {
    // Client at 5.0s, expected at 10.0s -> 5000ms drift
    const action = evaluateDriftAction(5.0, 10.0, 1.0);
    expect(action.type).toBe("HARD_SEEK");
    if (action.type === "HARD_SEEK") {
      expect(action.targetTime).toBe(10.0);
      expect(action.driftMs).toBe(-5000);
    }
  });
});
