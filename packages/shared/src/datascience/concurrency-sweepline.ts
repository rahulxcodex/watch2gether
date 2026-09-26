/**
 * Sweep Line Concurrency Analyzer
 * Computes peak concurrent users and timeline intervals in O(n log n).
 */
export interface UserSessionInterval {
  userId: string;
  startTime: number;
  endTime: number;
}

export interface PeakConcurrencyResult {
  peakCount: number;
  peakTimeStart: number;
  peakTimeEnd: number;
}

export function computePeakConcurrency(sessions: UserSessionInterval[]): PeakConcurrencyResult {
  if (sessions.length === 0) {
    return { peakCount: 0, peakTimeStart: 0, peakTimeEnd: 0 };
  }

  // Generate sweep-line events: +1 on start, -1 on end
  // Sort by timestamp; on tie, process start (+1) before end (-1)
  type SweepEvent = { time: number; delta: number };
  const events: SweepEvent[] = [];

  for (const session of sessions) {
    events.push({ time: session.startTime, delta: 1 });
    events.push({ time: session.endTime, delta: -1 });
  }

  events.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    return b.delta - a.delta; // +1 before -1
  });

  let current = 0;
  let peak = 0;
  let peakStart = 0;
  let peakEnd = 0;

  for (let i = 0; i < events.length; i++) {
    current += events[i]!.delta;
    if (current > peak) {
      peak = current;
      peakStart = events[i]!.time;
      // Tentative end time is next event's time
      peakEnd = i + 1 < events.length ? events[i + 1]!.time : peakStart;
    }
  }

  return {
    peakCount: peak,
    peakTimeStart: peakStart,
    peakTimeEnd: peakEnd,
  };
}
