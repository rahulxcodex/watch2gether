"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  PlaybackStateDTO,
  SyncSample,
  calculateSyncSample,
  deriveAuthoritativeOffset,
  projectPlaybackTime,
  evaluateDriftAction,
  SYNC_CONSTANTS,
  UserDTO,
} from "@watch2gether/shared";
import { TypedSocket } from "@/lib/socket";
import { UnifiedPlayerInstance } from "@/components/player/types";

export interface SyncEngineStatus {
  isSynced: boolean;
  clockOffsetMs: number;
  rttLatencyMs: number;
  driftMs: number;
  syncTier: "IN_SYNC" | "SOFT_ADJUSTING" | "HARD_SEEKING" | "OFFLINE";
  version: number;
}

interface UseSyncEngineProps {
  socket: TypedSocket | null;
  roomCode: string;
  currentUser: UserDTO;
  playerRef: React.RefObject<UnifiedPlayerInstance | null>;
  canControl?: boolean;
}

export function useSyncEngine({
  socket,
  roomCode,
  currentUser,
  playerRef,
  canControl = true,
}: UseSyncEngineProps) {
  const [authoritativeState, setAuthoritativeState] = useState<PlaybackStateDTO>({
    status: "PAUSED",
    currentTime: 0,
    serverTimestamp: Date.now(),
    playbackRate: 1.0,
    version: 0,
  });

  const [syncStatus, setSyncStatus] = useState<SyncEngineStatus>({
    isSynced: false,
    clockOffsetMs: 0,
    rttLatencyMs: 0,
    driftMs: 0,
    syncTier: "OFFLINE",
    version: 0,
  });

  // State refs for low-latency interval loops
  const syncSamplesRef = useRef<SyncSample[]>([]);
  const clockOffsetRef = useRef<number>(0);
  const bestRttRef = useRef<number>(0);
  const authStateRef = useRef<PlaybackStateDTO>(authoritativeState);
  authStateRef.current = authoritativeState;

  const isProgrammaticSyncRef = useRef<boolean>(false);
  const lastVersionRef = useRef<number>(0);
  const lastStatusUpdateRef = useRef<number>(0);
  const lastSyncTierRef = useRef<string>("OFFLINE");
  const driftIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to throttle React state updates to prevent thrashing
  const updateSyncStatusThrottled = useCallback(
    (driftMs: number, syncTier: "IN_SYNC" | "SOFT_ADJUSTING" | "HARD_SEEKING" | "OFFLINE") => {
      const now = Date.now();
      const tierChanged = lastSyncTierRef.current !== syncTier;
      if (tierChanged || now - lastStatusUpdateRef.current >= 1000) {
        lastStatusUpdateRef.current = now;
        lastSyncTierRef.current = syncTier;
        setSyncStatus((prev) => ({
          ...prev,
          driftMs,
          syncTier,
          version: lastVersionRef.current,
        }));
      }
    },
    []
  );

  // Send an NTP clock synchronization ping
  const sendSyncPing = useCallback(() => {
    if (!socket || !socket.connected) return;
    const clientTimestamp = Date.now();
    socket.emit("sync:ping", { clientTimestamp });
  }, [socket]);

  // Handle incoming NTP clock sync pong
  const handleSyncPong = useCallback((payload: { clientTimestamp: number; serverTimestamp: number }) => {
    const clientReceiveTime = Date.now();
    const sample = calculateSyncSample(
      payload.clientTimestamp,
      payload.serverTimestamp,
      clientReceiveTime
    );

    const samples = [...syncSamplesRef.current, sample].slice(-SYNC_CONSTANTS.MAX_SAMPLE_WINDOW_SIZE);
    syncSamplesRef.current = samples;

    const { offset, bestRtt } = deriveAuthoritativeOffset(samples, clockOffsetRef.current);
    clockOffsetRef.current = offset;
    bestRttRef.current = bestRtt;

    setSyncStatus((prev) => ({
      ...prev,
      isSynced: true,
      clockOffsetMs: offset,
      rttLatencyMs: bestRtt,
    }));
  }, []);

  // Apply authoritative state changes from server (with echo suppression & monotonic versioning)
  const handleIncomingMediaSync = useCallback(
    async (newState: PlaybackStateDTO) => {
      // 1. Monotonic Versioning: Discard stale packets
      if (newState.version && newState.version < lastVersionRef.current) {
        return;
      }
      if (newState.version) {
        lastVersionRef.current = newState.version;
      }

      setAuthoritativeState(newState);

      const player = playerRef.current;
      if (!player) return;

      // 2. Local Echo Suppression: Ignore server reflection of our own initiated action
      if (newState.issuerId && newState.issuerId === currentUser.id && isProgrammaticSyncRef.current) {
        return;
      }

      const isPlaying = (newState.status || newState.state) === "PLAYING";
      const expectedTime = projectPlaybackTime(newState, Date.now(), clockOffsetRef.current);

      isProgrammaticSyncRef.current = true;

      try {
        if (!isPlaying) {
          // Fast Pause Propagation (sub-200ms)
          await player.pause();
          await player.seekTo(newState.currentTime);
          await player.setPlaybackRate(1.0);
        } else {
          // Play state alignment
          const currentLocalTime = player.getCurrentTime();
          const drift = Math.abs(currentLocalTime - expectedTime);

          if (drift > 0.5) {
            await player.seekTo(expectedTime);
          }
          await player.play();
          await player.setPlaybackRate(newState.playbackRate || 1.0);
        }
      } finally {
        setTimeout(() => {
          isProgrammaticSyncRef.current = false;
        }, 300);
      }
    },
    [currentUser.id, playerRef]
  );

  // High frequency 3-tier drift reconciliation loop (runs every 150ms)
  useEffect(() => {
    driftIntervalRef.current = setInterval(async () => {
      const player = playerRef.current;
      if (!player || isProgrammaticSyncRef.current) return;

      const currentState = authStateRef.current;
      const isExpectedPlaying = (currentState.status || currentState.state) === "PLAYING";

      // If playback is paused on server, ensure local player is also paused
      if (!isExpectedPlaying) {
        if (!player.isPaused()) {
          isProgrammaticSyncRef.current = true;
          await player.pause();
          await player.seekTo(currentState.currentTime);
          setTimeout(() => {
            isProgrammaticSyncRef.current = false;
          }, 200);
        }
        updateSyncStatusThrottled(0, "IN_SYNC");
        return;
      }

      // If playing, calculate projected expected playhead P(t)
      const expectedTime = projectPlaybackTime(currentState, Date.now(), clockOffsetRef.current);
      const actualTime = player.getCurrentTime();
      const baseRate = currentState.playbackRate || 1.0;
      const driftAction = evaluateDriftAction(actualTime, expectedTime, baseRate);

      switch (driftAction.type) {
        case "NONE":
          if (player.getPlaybackRate() !== baseRate) {
            await player.setPlaybackRate(baseRate);
          }
          updateSyncStatusThrottled(driftAction.driftMs, "IN_SYNC");
          break;

        case "RATE_ADJUST":
          // Tier 2: Micro-rate adjustment
          if (player.getPlaybackRate() !== driftAction.targetRate) {
            await player.setPlaybackRate(driftAction.targetRate);
          }
          updateSyncStatusThrottled(driftAction.driftMs, "SOFT_ADJUSTING");
          break;

        case "HARD_SEEK":
          // Tier 3: Hard seek to authoritative projection
          isProgrammaticSyncRef.current = true;
          await player.seekTo(driftAction.targetTime);
          await player.setPlaybackRate(baseRate);
          setTimeout(() => {
            isProgrammaticSyncRef.current = false;
          }, 300);

          updateSyncStatusThrottled(driftAction.driftMs, "HARD_SEEKING");
          break;
      }
    }, 150);

    return () => {
      if (driftIntervalRef.current) clearInterval(driftIntervalRef.current);
    };
  }, [playerRef, updateSyncStatusThrottled]);

  // Socket event binding for clock sync and media state
  useEffect(() => {
    if (!socket) return;

    socket.on("sync:pong", handleSyncPong);
    socket.on("media:sync", handleIncomingMediaSync);

    // Initial rapid sync bursts
    for (let i = 0; i < SYNC_CONSTANTS.INITIAL_SYNC_ROUNDS; i++) {
      setTimeout(() => sendSyncPing(), i * SYNC_CONSTANTS.INITIAL_SYNC_DELAY_MS);
    }

    // Routine periodic sync ping
    pingIntervalRef.current = setInterval(sendSyncPing, SYNC_CONSTANTS.SYNC_INTERVAL_MS);

    return () => {
      socket.off("sync:pong", handleSyncPong);
      socket.off("media:sync", handleIncomingMediaSync);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };
  }, [socket, handleSyncPong, handleIncomingMediaSync, sendSyncPing]);

  // Client Initiated Actions (Emits to WebSocket Server)
  const emitPlay = useCallback(
    (currentTime: number) => {
      if (!socket || !canControl) return;
      isProgrammaticSyncRef.current = true;
      socket.emit("media:play", {
        roomCode,
        currentTime,
        clientTimestamp: Date.now(),
        playbackRate: 1.0,
      });
      setTimeout(() => {
        isProgrammaticSyncRef.current = false;
      }, 300);
    },
    [socket, roomCode, canControl]
  );

  const emitPause = useCallback(
    (currentTime: number) => {
      if (!socket || !canControl) return;
      isProgrammaticSyncRef.current = true;
      socket.emit("media:pause", {
        roomCode,
        currentTime,
        clientTimestamp: Date.now(),
      });
      setTimeout(() => {
        isProgrammaticSyncRef.current = false;
      }, 300);
    },
    [socket, roomCode, canControl]
  );

  const emitSeek = useCallback(
    (targetTime: number) => {
      if (!socket || !canControl) return;
      isProgrammaticSyncRef.current = true;
      socket.emit("media:seek", {
        roomCode,
        targetTime,
        clientTimestamp: Date.now(),
      });
      setTimeout(() => {
        isProgrammaticSyncRef.current = false;
      }, 300);
    },
    [socket, roomCode, canControl]
  );

  const snapToAuthoritativeTime = useCallback(async () => {
    const player = playerRef.current;
    if (!player) return;
    const currentState = authStateRef.current;
    const expectedTime = projectPlaybackTime(currentState, Date.now(), clockOffsetRef.current);
    isProgrammaticSyncRef.current = true;
    await player.seekTo(expectedTime);
    await player.setPlaybackRate(currentState.playbackRate || 1.0);
    setTimeout(() => {
      isProgrammaticSyncRef.current = false;
    }, 300);
  }, [playerRef]);

  return {
    authoritativeState,
    syncStatus,
    emitPlay,
    emitPause,
    emitSeek,
    handleIncomingMediaSync,
    sendSyncPing,
    snapToAuthoritativeTime,
  };
}
