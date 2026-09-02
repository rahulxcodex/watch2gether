import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  calculateSyncSample,
  deriveAuthoritativeOffset,
  projectPlaybackTime,
  evaluateDriftAction,
  SYNC_CONSTANTS,
  PlaybackStateDTO,
  SyncSample,
  UserDTO,
} from "@watch2gether/shared";
import { useSyncEngine } from "@/hooks/useSyncEngine";
import { UnifiedPlayerInstance } from "@/components/player/types";

// ============================================================================
// STRESS TEST SUITE: WEB CLIENT SYNC ENGINE & DRIFT RECONCILIATION
// ============================================================================

describe("Web Sync Engine - Empirical Stress & Adversarial Test Suite", () => {
  // --------------------------------------------------------------------------
  // Area 1: Network Jitter (10ms - 300ms) and Clock Skew Simulation
  // --------------------------------------------------------------------------
  describe("Area 1: Network Jitter (10ms - 300ms) & Clock Skew Simulation", () => {
    it("should accurately estimate clock offset under continuous stochastic jitter (10ms to 300ms RTT) over 500 rounds", () => {
      const trueClockSkew = 1845; // Server clock is +1845ms ahead of client
      const samples: SyncSample[] = [];
      let estimatedOffset = 0;
      const windowSize = SYNC_CONSTANTS.MAX_SAMPLE_WINDOW_SIZE; // 10
      const errors: number[] = [];

      for (let i = 0; i < 500; i++) {
        const clientSend = 100000 + i * 1000;
        // Variable RTT between 10ms and 300ms with random uplink/downlink asymmetry
        const rtt = 10 + Math.random() * 290;
        const uplinkRatio = 0.3 + Math.random() * 0.4; // 30% - 70% asymmetric split
        const uplinkLatency = rtt * uplinkRatio;
        const downlinkLatency = rtt * (1 - uplinkRatio);

        const serverTime = Math.round(clientSend + trueClockSkew + uplinkLatency);
        const clientReceive = Math.round(clientSend + uplinkLatency + downlinkLatency);

        const sample = calculateSyncSample(clientSend, serverTime, clientReceive);
        samples.push(sample);
        if (samples.length > windowSize) {
          samples.shift();
        }

        const derived = deriveAuthoritativeOffset(samples, estimatedOffset, 0.7);
        estimatedOffset = derived.offset;

        // Collect offset error after initial window fills
        if (i >= windowSize) {
          errors.push(Math.abs(estimatedOffset - trueClockSkew));
        }
      }

      // Statistical verification
      errors.sort((a, b) => a - b);
      const p50 = errors[Math.floor(errors.length * 0.5)];
      const p90 = errors[Math.floor(errors.length * 0.9)];
      const maxError = errors[errors.length - 1];

      // Cristian algorithm with lowest-RTT window selection effectively isolates low-latency packets
      expect(p50).toBeLessThanOrEqual(25); // Median error <= 25ms
      expect(p90).toBeLessThanOrEqual(50); // 90th percentile <= 50ms
      expect(maxError).toBeLessThanOrEqual(150); // Max error strictly bounded
    });

    it("should maintain accurate playhead projection P(t) across wide range of clock skews (-30s to +30s)", () => {
      const skews = [-30000, -15000, -5000, -500, 0, 500, 5000, 15000, 30000];

      for (const skew of skews) {
        const serverBaseTime = 500000;
        const clientBaseTime = serverBaseTime - skew;

        const serverState: PlaybackStateDTO = {
          status: "PLAYING",
          currentTime: 120.0,
          serverTimestamp: serverBaseTime,
          playbackRate: 1.0,
          version: 1,
        };

        // Client evaluates playback at clientBaseTime + 4.5 seconds (in client local time)
        const clientEvalTime = clientBaseTime + 4500;
        const projected = projectPlaybackTime(serverState, clientEvalTime, skew);

        // Expected: 120.0 + 4.5s = 124.5s
        expect(projected).toBeCloseTo(124.5, 3);
      }
    });

    it("should clamp playhead projection cleanly to media duration when provided", () => {
      const serverState: PlaybackStateDTO = {
        status: "PLAYING",
        currentTime: 55.0,
        serverTimestamp: 10000,
        playbackRate: 1.0,
        duration: 60.0, // Media duration is 60s
        version: 1,
      };

      // Client evaluates 10 seconds later (would be 65.0s without clamping)
      const projected = projectPlaybackTime(serverState, 20000, 0);
      expect(projected).toBe(60.0);
    });
  });

  // --------------------------------------------------------------------------
  // Area 2: Rate Adjustment Convergence Under Simulated 300ms Drift
  // --------------------------------------------------------------------------
  describe("Area 2: Rate Adjustment Convergence Under Simulated 300ms Drift", () => {
    it("should simulate progressive convergence of +300ms drift (client ahead) into deadband (<= 150ms)", () => {
      // Client is at 10.300s, Authoritative is at 10.000s -> +300ms drift
      let clientLocalTime = 10.300;
      let authoritativeTime = 10.000;
      let currentRate = 1.0;
      const tickIntervalSec = 0.150; // 150ms drift evaluation loop interval

      const trajectory: { tick: number; driftMs: number; rate: number; tier: string }[] = [];
      let converged = false;
      let convergenceTicks = 0;

      // Run up to 30 ticks (4.5 seconds max)
      for (let tick = 0; tick < 30; tick++) {
        const driftAction = evaluateDriftAction(clientLocalTime, authoritativeTime, currentRate);
        const driftMs = Math.round((clientLocalTime - authoritativeTime) * 1000);

        trajectory.push({
          tick,
          driftMs,
          rate: currentRate,
          tier: driftAction.type,
        });

        if (driftAction.type === "NONE") {
          currentRate = 1.0;
          converged = true;
          convergenceTicks = tick;
          break;
        } else if (driftAction.type === "RATE_ADJUST") {
          currentRate = driftAction.targetRate; // 0.92x
        }

        // Simulate 1 tick of playback progression
        clientLocalTime += tickIntervalSec * currentRate; // Advances by 150ms * 0.92 = 138ms
        authoritativeTime += tickIntervalSec * 1.0; // Advances by 150ms * 1.0 = 150ms
        // Net drift reduction per tick = 150 - 138 = 12ms
      }

      expect(converged).toBe(true);
      // Mathematical expectation: (300ms - 150ms) / 12ms per tick = 12.5 -> ~13 ticks (~1.95s)
      expect(convergenceTicks).toBeGreaterThanOrEqual(11);
      expect(convergenceTicks).toBeLessThanOrEqual(15);

      // Verify that after entering deadband, rate normalizes back to 1.0
      const finalAction = evaluateDriftAction(clientLocalTime, authoritativeTime, currentRate);
      expect(finalAction.type).toBe("NONE");
      expect(Math.abs(finalAction.driftMs)).toBeLessThanOrEqual(150);
    });

    it("should simulate progressive convergence of -300ms drift (client behind) into deadband (<= 150ms)", () => {
      // Client is at 9.700s, Authoritative is at 10.000s -> -300ms drift
      let clientLocalTime = 9.700;
      let authoritativeTime = 10.000;
      let currentRate = 1.0;
      const tickIntervalSec = 0.150; // 150ms interval

      let converged = false;
      let convergenceTicks = 0;

      for (let tick = 0; tick < 30; tick++) {
        const driftAction = evaluateDriftAction(clientLocalTime, authoritativeTime, currentRate);

        if (driftAction.type === "NONE") {
          currentRate = 1.0;
          converged = true;
          convergenceTicks = tick;
          break;
        } else if (driftAction.type === "RATE_ADJUST") {
          currentRate = driftAction.targetRate; // 1.08x
        }

        // Client advances by 150ms * 1.08 = 162ms
        // Server advances by 150ms * 1.0 = 150ms
        // Net catchup per tick = +12ms
        clientLocalTime += tickIntervalSec * currentRate;
        authoritativeTime += tickIntervalSec * 1.0;
      }

      expect(converged).toBe(true);
      expect(convergenceTicks).toBeGreaterThanOrEqual(11);
      expect(convergenceTicks).toBeLessThanOrEqual(15);
      expect(currentRate).toBe(1.0);
    });

    it("should immediately trigger HARD_SEEK for drift exceeding 1000ms threshold", () => {
      const clientTime = 5.0; // 5 seconds behind authoritative 10.0
      const expectedTime = 10.0;

      const action = evaluateDriftAction(clientTime, expectedTime, 1.0);
      expect(action.type).toBe("HARD_SEEK");
      if (action.type === "HARD_SEEK") {
        expect(action.targetTime).toBe(10.0);
        expect(action.driftMs).toBe(-5000);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Area 3: Rapid Successive Seek, Play, Pause & Echo-Loop Suppression
  // --------------------------------------------------------------------------
  describe("Area 3: Rapid Successive Events, Echo-Loop Suppression & Monotonic Versioning", () => {
    let mockSocket: any;
    let mockPlayer: UnifiedPlayerInstance;
    let currentUser: UserDTO;
    let emittedEvents: { event: string; data: any }[];
    let playerCalls: { method: string; args: any[] }[];

    beforeEach(() => {
      vi.useFakeTimers();
      emittedEvents = [];
      playerCalls = [];

      mockSocket = {
        connected: true,
        emit: vi.fn((event: string, data: any) => {
          emittedEvents.push({ event, data });
        }),
        on: vi.fn(),
        off: vi.fn(),
      };

      let playerTime = 0;
      let playerPlaying = false;
      let playerRate = 1.0;

      mockPlayer = {
        play: vi.fn(async () => {
          playerPlaying = true;
          playerCalls.push({ method: "play", args: [] });
        }),
        pause: vi.fn(async () => {
          playerPlaying = false;
          playerCalls.push({ method: "pause", args: [] });
        }),
        seekTo: vi.fn(async (seconds: number) => {
          playerTime = seconds;
          playerCalls.push({ method: "seekTo", args: [seconds] });
        }),
        setPlaybackRate: vi.fn(async (rate: number) => {
          playerRate = rate;
          playerCalls.push({ method: "setPlaybackRate", args: [rate] });
        }),
        getCurrentTime: vi.fn(() => playerTime),
        getDuration: vi.fn(() => 300),
        isPaused: vi.fn(() => !playerPlaying),
        getPlaybackRate: vi.fn(() => playerRate),
        setVolume: vi.fn(),
        setMuted: vi.fn(),
      };

      currentUser = {
        id: "user_challenger_1",
        name: "Empirical Tester",
        avatarColor: "#6366f1",
        isGuest: true,
      };
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should suppress local echo loop when server reflects back the user's own emitted action", async () => {
      const playerRef = { current: mockPlayer };

      const { result } = renderHook(() =>
        useSyncEngine({
          socket: mockSocket,
          roomCode: "TEST_ROOM",
          currentUser,
          playerRef,
          canControl: true,
        })
      );

      // Client initiates a Play action
      act(() => {
        result.current.emitPlay(15.0);
      });

      expect(mockSocket.emit).toHaveBeenCalledWith("media:play", expect.objectContaining({
        roomCode: "TEST_ROOM",
        currentTime: 15.0,
      }));

      // Server immediately broadcasts media:sync with issuerId === currentUser.id
      const reflectedSyncPacket: PlaybackStateDTO = {
        status: "PLAYING",
        currentTime: 15.0,
        serverTimestamp: Date.now(),
        playbackRate: 1.0,
        version: 1,
        issuerId: currentUser.id, // Reflection of our own action
      };

      playerCalls = []; // Clear call log

      // Incoming reflection during programmatic sync suppression window
      await act(async () => {
        await result.current.handleIncomingMediaSync(reflectedSyncPacket);
      });

      // Assert that player was NOT re-triggered (echo suppressed)
      expect(mockPlayer.play).not.toHaveBeenCalled();
      expect(mockPlayer.seekTo).not.toHaveBeenCalled();
    });

    it("should strictly enforce monotonic versioning by discarding stale out-of-order packets", async () => {
      const playerRef = { current: mockPlayer };

      const { result } = renderHook(() =>
        useSyncEngine({
          socket: mockSocket,
          roomCode: "TEST_ROOM",
          currentUser,
          playerRef,
          canControl: true,
        })
      );

      // Server delivers Version 5 (Seek to 50.0s)
      const packetV5: PlaybackStateDTO = {
        status: "PLAYING",
        currentTime: 50.0,
        serverTimestamp: Date.now(),
        playbackRate: 1.0,
        version: 5,
        issuerId: "other_user_2",
      };

      await act(async () => {
        await result.current.handleIncomingMediaSync(packetV5);
      });

      expect(result.current.authoritativeState.version).toBe(5);
      expect(result.current.authoritativeState.currentTime).toBe(50.0);

      // Network delivers stale Version 3 (Out of order packet from earlier pause)
      const packetV3: PlaybackStateDTO = {
        status: "PAUSED",
        currentTime: 20.0,
        serverTimestamp: Date.now() - 5000,
        playbackRate: 1.0,
        version: 3,
        issuerId: "other_user_2",
      };

      playerCalls = [];
      await act(async () => {
        await result.current.handleIncomingMediaSync(packetV3);
      });

      // Assert that Version 3 was rejected and state remains at Version 5
      expect(result.current.authoritativeState.version).toBe(5);
      expect(result.current.authoritativeState.currentTime).toBe(50.0);
      expect(mockPlayer.pause).not.toHaveBeenCalled();
    });

    it("should handle rapid burst of 50 alternating seek, play, and pause events without race condition or state corruption", async () => {
      const playerRef = { current: mockPlayer };

      const { result } = renderHook(() =>
        useSyncEngine({
          socket: mockSocket,
          roomCode: "BURST_ROOM",
          currentUser,
          playerRef,
          canControl: true,
        })
      );

      // Simulate rapid burst of 50 incoming state changes from remote peers with ascending version numbers
      for (let i = 1; i <= 50; i++) {
        const isPause = i % 3 === 0;
        const targetTime = i * 2.5;

        const packet: PlaybackStateDTO = {
          status: isPause ? "PAUSED" : "PLAYING",
          currentTime: targetTime,
          serverTimestamp: Date.now(),
          playbackRate: 1.0,
          version: i,
          issuerId: "peer_user_" + (i % 4),
        };

        await act(async () => {
          await result.current.handleIncomingMediaSync(packet);
        });
      }

      // Assert that authoritative state ended up strictly at final version 50
      expect(result.current.authoritativeState.version).toBe(50);
      expect(result.current.authoritativeState.currentTime).toBe(50 * 2.5);
    });

    it("should execute fast pause propagation within <= 200ms budget", async () => {
      const playerRef = { current: mockPlayer };

      const { result } = renderHook(() =>
        useSyncEngine({
          socket: mockSocket,
          roomCode: "TEST_ROOM",
          currentUser,
          playerRef,
          canControl: true,
        })
      );

      const pausePacket: PlaybackStateDTO = {
        status: "PAUSED",
        currentTime: 45.0,
        serverTimestamp: Date.now(),
        playbackRate: 1.0,
        version: 10,
        issuerId: "host_user",
      };

      const startTime = performance.now();
      await act(async () => {
        await result.current.handleIncomingMediaSync(pausePacket);
      });
      const durationMs = performance.now() - startTime;

      expect(mockPlayer.pause).toHaveBeenCalled();
      expect(mockPlayer.seekTo).toHaveBeenCalledWith(45.0);
      expect(durationMs).toBeLessThanOrEqual(200); // Sub-200ms latency execution
    });
  });
});
