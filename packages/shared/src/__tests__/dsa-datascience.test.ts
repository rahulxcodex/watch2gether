import { describe, it, expect } from 'vitest';
import {
  CircularBuffer,
  PriorityQueue,
  Trie,
  LWWRegister,
  LWWMap,
  BloomFilter,
  SlidingWindowRateLimiter,
  ConsistentHashRing,
  KalmanFilter1D,
  ClockKalmanFilter,
  LatencyAnomalyDetector,
  predictBufferExhaustion,
  computePeakConcurrency,
  kmeans,
  ChatModerator,
  CollaborativeRecommender,
  TabularQReconciler,
  filterOutliersIQR,
  adaptiveAlpha,
  deriveAuthoritativeOffsetAdaptive,
  findNearestBufferedTime,
} from '../index';

describe('DSA Modules', () => {
  describe('CircularBuffer (Tier 1.2)', () => {
    it('should maintain capacity and overwrite oldest elements', () => {
      const buffer = new CircularBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      expect(buffer.size()).toBe(3);
      expect(buffer.isFull()).toBe(true);
      expect(buffer.toArray()).toEqual([1, 2, 3]);

      buffer.push(4); // Overwrite 1
      expect(buffer.size()).toBe(3);
      expect(buffer.toArray()).toEqual([2, 3, 4]);

      buffer.push(5); // Overwrite 2
      expect(buffer.toArray()).toEqual([3, 4, 5]);
    });

    it('should clear properly', () => {
      const buf = new CircularBuffer<string>(5);
      buf.push('hello');
      buf.clear();
      expect(buf.size()).toBe(0);
      expect(buf.toArray()).toEqual([]);
    });
  });

  describe('PriorityQueue (Tier 2.1)', () => {
    it('should order elements according to custom comparator (Max-Heap for upvotes)', () => {
      interface VideoVote {
        id: string;
        votes: number;
        timestamp: number;
      }
      const pq = new PriorityQueue<VideoVote>((a, b) => {
        if (b.votes !== a.votes) return b.votes - a.votes;
        return a.timestamp - b.timestamp;
      });

      pq.enqueue({ id: 'v1', votes: 1, timestamp: 100 });
      pq.enqueue({ id: 'v2', votes: 10, timestamp: 200 });
      pq.enqueue({ id: 'v3', votes: 5, timestamp: 150 });

      expect(pq.peek()?.id).toBe('v2');
      expect(pq.dequeue()?.id).toBe('v2');
      expect(pq.dequeue()?.id).toBe('v3');
      expect(pq.dequeue()?.id).toBe('v1');
      expect(pq.dequeue()).toBeUndefined();
    });

    it('should remove elements matching predicate', () => {
      const pq = new PriorityQueue<number>((a, b) => a - b);
      pq.enqueue(10);
      pq.enqueue(5);
      pq.enqueue(20);
      expect(pq.remove((x) => x === 5)).toBe(true);
      expect(pq.peek()).toBe(10);
    });
  });

  describe('Trie (Tier 2.2)', () => {
    it('should insert and match prefixes for command autocomplete', () => {
      const trie = new Trie<string>();
      trie.insert('/play', 'Play current media');
      trie.insert('/pause', 'Pause playback');
      trie.insert('/queue', 'Show media queue');
      trie.insert('/quick-sync', 'Perform rapid clock sync');

      expect(trie.hasWord('/play')).toBe(true);
      expect(trie.hasWord('/nonexistent')).toBe(false);

      const matches = trie.searchPrefix('/p');
      expect(matches.map((m) => m.word)).toEqual(['/play', '/pause']);

      const qMatches = trie.searchPrefix('/q');
      expect(qMatches.map((m) => m.word)).toEqual(['/queue', '/quick-sync']);
    });
  });

  describe('CRDT LWW-Register & LWW-Map (Tier 3.1)', () => {
    it('should resolve concurrent writes deterministically via timestamps and peerIds', () => {
      const reg = new LWWRegister<string>('initial', 100, 'peerA');
      // Older update should be rejected
      const acceptedOld = reg.update('old', 90, 'peerB');
      expect(acceptedOld).toBe(false);
      expect(reg.value).toBe('initial');

      // Newer update should be accepted
      const acceptedNew = reg.update('newer', 110, 'peerB');
      expect(acceptedNew).toBe(true);
      expect(reg.value).toBe('newer');

      // Same timestamp tie-broken by peerId
      reg.update('tied-low', 120, 'peer1');
      const tiedHigh = reg.update('tied-high', 120, 'peer2');
      expect(tiedHigh).toBe(true);
      expect(reg.value).toBe('tied-high');
    });

    it('should correctly merge LWWMap entries', () => {
      const map = new LWWMap<string, number>();
      map.set('time', 15.5, 100, 'host');
      map.merge('time', { value: 16.0, timestamp: 110, peerId: 'viewer' });
      expect(map.get('time')).toBe(16.0);
    });
  });

  describe('BloomFilter (Tier 3.2)', () => {
    it('should correctly test set membership with zero false negatives', () => {
      const bf = new BloomFilter(1024, 3);
      bf.add('msg-1234');
      bf.add('msg-5678');

      expect(bf.mightContain('msg-1234')).toBe(true);
      expect(bf.mightContain('msg-5678')).toBe(true);
      expect(bf.mightContain('msg-never-seen-xyz')).toBe(false);
    });
  });

  describe('SlidingWindowRateLimiter (Tier 1.3)', () => {
    it('should allow requests within limit and throttle when exceeded', () => {
      const limiter = new SlidingWindowRateLimiter(3, 1000);
      const now = 10000;
      expect(limiter.allow(now)).toBe(true);
      expect(limiter.allow(now + 10)).toBe(true);
      expect(limiter.allow(now + 20)).toBe(true);
      expect(limiter.allow(now + 30)).toBe(false); // Throttled

      // After window passes
      expect(limiter.allow(now + 1100)).toBe(true);
    });
  });

  describe('ConsistentHashRing (Tier 3.3)', () => {
    it('should deterministically map keys to nodes', () => {
      const ring = new ConsistentHashRing<string>(30);
      ring.addNode('redis-node-1', 'node-1');
      ring.addNode('redis-node-2', 'node-2');
      ring.addNode('redis-node-3', 'node-3');

      const target1 = ring.getNode('room-alpha');
      const target2 = ring.getNode('room-alpha');
      expect(target1).toBe(target2);
      expect(typeof target1).toBe('string');
    });
  });
});

describe('Data Science & Statistical Models', () => {
  describe('Kalman Filter (Tier 5.1)', () => {
    it('should converge 1D scalar estimates towards true value under noise', () => {
      const kf = new KalmanFilter1D(0, 100, 0.01, 2.0);
      let estimate = 0;
      // Feed noisy measurements of true value 42
      for (let i = 0; i < 20; i++) {
        const noise = (i % 2 === 0 ? 1 : -1) * 1.5;
        estimate = kf.update(42 + noise);
      }
      expect(estimate).toBeCloseTo(42, 0);
    });

    it('should estimate clock offset and drift velocity', () => {
      const clockKf = new ClockKalmanFilter(0);
      // Advance 1s and measure offset = 25ms with 10ms RTT
      clockKf.predict(1.0);
      const res1 = clockKf.update(25, 10);
      expect(typeof res1.offset).toBe('number');
      expect(typeof res1.driftRate).toBe('number');
    });
  });

  describe('LatencyAnomalyDetector (Tier 5.2)', () => {
    it('should detect extreme latency spikes using Z-scores', () => {
      const detector = new LatencyAnomalyDetector(15, 2.0);
      // Stable 30ms latency
      for (let i = 0; i < 10; i++) {
        detector.addSample(30 + (i % 2));
      }

      const normal = detector.addSample(32);
      expect(normal.isAnomaly).toBe(false);

      // Sudden 200ms latency spike
      const spike = detector.addSample(200);
      expect(spike.isAnomaly).toBe(true);
      expect(spike.zScore).toBeGreaterThan(2.0);
    });
  });

  describe('BufferPredictor (Tier 5.4)', () => {
    it('should predict buffer depletion correctly when drain exceeds fill rate', () => {
      // 5s of buffer, download rate 100KB/s, video bitrate 200KB/s, playback 1.0x
      // Net drain = 1.0 - 0.5 = 0.5s buffer lost per second
      // Depletion time = 5s / 0.5 = 10s
      const pred = predictBufferExhaustion(5, 100000, 200000, 1.0);
      expect(pred.depletionTimeSeconds).toBe(10);
      expect(pred.willStallSoon).toBe(false);

      // If only 1s of buffer left, should warn of stall soon
      const stallPred = predictBufferExhaustion(1, 100000, 200000, 1.0, 4.0);
      expect(stallPred.willStallSoon).toBe(true);
    });
  });

  describe('Sweep Line Concurrency (Tier 3.4)', () => {
    it('should compute exact peak concurrent viewers across overlapping intervals', () => {
      const sessions = [
        { userId: 'u1', startTime: 10, endTime: 50 },
        { userId: 'u2', startTime: 20, endTime: 60 },
        { userId: 'u3', startTime: 30, endTime: 40 },
        { userId: 'u4', startTime: 70, endTime: 90 },
      ];
      const peak = computePeakConcurrency(sessions);
      // At t=30, u1, u2, u3 are all active => 3 concurrent
      expect(peak.peakCount).toBe(3);
      expect(peak.peakTimeStart).toBe(30);
    });
  });

  describe('K-Means Clustering (Tier 5.3)', () => {
    it('should cluster multi-dimensional user telemetry into k groups', () => {
      const points = [
        [1, 1],
        [1.5, 2],
        [2, 1],
        [10, 10],
        [11, 12],
        [12, 10],
      ];
      const result = kmeans(points, 2, 30);
      expect(result.centroids.length).toBe(2);
      expect(result.assignments.length).toBe(6);
      // First 3 should belong to the same cluster
      expect(result.assignments[0]).toBe(result.assignments[1]);
      expect(result.assignments[1]).toBe(result.assignments[2]);
      // Last 3 should belong to the same cluster
      expect(result.assignments[3]).toBe(result.assignments[4]);
      expect(result.assignments[4]).toBe(result.assignments[5]);
      // First 3 and last 3 should be in different clusters
      expect(result.assignments[0]).not.toBe(result.assignments[3]);
    });
  });

  describe('ChatModerator (Tier 6.1)', () => {
    it('should flag toxic content and allow benign messages', () => {
      const mod = new ChatModerator();
      const benign = mod.evaluate('Hey everyone, ready for the movie?');
      expect(benign.isBlocked).toBe(false);
      expect(benign.isFlagged).toBe(false);

      const spam = mod.evaluate('Check out this free crypto botnet scam now!');
      expect(spam.isFlagged).toBe(true);

      const severe = mod.evaluate('kill yourself asshole bastard');
      expect(severe.isBlocked).toBe(true);
    });
  });

  describe('CollaborativeRecommender (Tier 6.2)', () => {
    it('should compute item similarity based on user co-occurrence', () => {
      const rec = new CollaborativeRecommender();
      rec.recordInteraction('alice', 'movie-A');
      rec.recordInteraction('bob', 'movie-A');
      rec.recordInteraction('charlie', 'movie-A');

      rec.recordInteraction('alice', 'movie-B');
      rec.recordInteraction('bob', 'movie-B');

      rec.recordInteraction('david', 'movie-C');

      const simAB = rec.getSimilarity('movie-A', 'movie-B');
      const simAC = rec.getSimilarity('movie-A', 'movie-C');

      expect(simAB).toBeGreaterThan(0.5);
      expect(simAC).toBe(0);

      const recs = rec.getRecommendationsForMedia('movie-A');
      expect(recs[0]?.mediaUrl).toBe('movie-B');
    });
  });

  describe('TabularQReconciler (Tier 6.3)', () => {
    it('should discretize state and update Q-values according to reward', () => {
      const rl = new TabularQReconciler();
      const s0 = { driftMs: -300, rttMs: 30, bufferSeconds: 5 };
      const action = rl.selectAction(s0);
      expect(['NONE', 'RATE_UP', 'RATE_DOWN', 'HARD_SEEK']).toContain(action);

      const reward = TabularQReconciler.computeReward(-300, false, action);
      const s1 = { driftMs: -50, rttMs: 32, bufferSeconds: 5.2 };
      rl.update(s0, action, reward, s1);

      const qTable = rl.exportQTable();
      const stateKey = rl.discretize(s0);
      expect(qTable[stateKey]).toBeDefined();
    });
  });

  describe('IQR Filter & Adaptive NTP Smoothing (Tier 4.2 & 4.3)', () => {
    it('should filter extreme RTT outliers with IQR', () => {
      const samples = [
        { rtt: 20, offset: 10, clientTimestamp: 1, serverTimestamp: 11 },
        { rtt: 22, offset: 11, clientTimestamp: 2, serverTimestamp: 12 },
        { rtt: 21, offset: 10, clientTimestamp: 3, serverTimestamp: 13 },
        { rtt: 19, offset: 9, clientTimestamp: 4, serverTimestamp: 14 },
        { rtt: 500, offset: 250, clientTimestamp: 5, serverTimestamp: 255 }, // Outlier!
      ];

      const cleaned = filterOutliersIQR(samples);
      expect(cleaned.length).toBe(4);
      expect(cleaned.some((s) => s.rtt === 500)).toBe(false);
    });

    it('should adjust alpha downwards under high RTT jitter', () => {
      const lowJitter = [20, 21, 20, 22, 21];
      const highJitter = [10, 80, 20, 150, 30];

      const alphaLow = adaptiveAlpha(lowJitter, 0.7);
      const alphaHigh = adaptiveAlpha(highJitter, 0.7);

      expect(alphaLow).toBeGreaterThan(alphaHigh);
    });

    it('should derive authoritative offset using adaptive filtering', () => {
      const samples = [
        { rtt: 25, offset: 100, clientTimestamp: 1, serverTimestamp: 1 },
        { rtt: 24, offset: 102, clientTimestamp: 2, serverTimestamp: 2 },
        { rtt: 26, offset: 98, clientTimestamp: 3, serverTimestamp: 3 },
        { rtt: 25, offset: 100, clientTimestamp: 4, serverTimestamp: 4 },
      ];

      const res = deriveAuthoritativeOffsetAdaptive(samples, 90, 0.7);
      expect(res.offset).toBeGreaterThan(90);
      expect(res.bestRtt).toBe(24);
    });
  });

  describe('Binary Search Seek in Buffered Ranges (Tier 2.4)', () => {
    it('should snap to nearest buffered range boundary within tolerance', () => {
      const buffered = [
        { start: 0, end: 10 },
        { start: 20, end: 30 },
        { start: 50, end: 60 },
      ];

      // Exact hit inside buffered range
      expect(findNearestBufferedTime(buffered, 5)).toBe(5);

      // Target at 19.5s (0.5s away from 20) -> should snap to 20
      expect(findNearestBufferedTime(buffered, 19.5, 2.0)).toBe(20);

      // Target at 31.0s (1.0s away from 30) -> should snap to 30
      expect(findNearestBufferedTime(buffered, 31.0, 2.0)).toBe(30);

      // Target at 40s (10s away from nearest 30/50, exceeds tolerance 2.0) -> unchanged
      expect(findNearestBufferedTime(buffered, 40.0, 2.0)).toBe(40.0);
    });
  });
});
