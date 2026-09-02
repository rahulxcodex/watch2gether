import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { buildApp } from '../src/app';
import { closeDatabase } from '../src/db/db';

describe('Sync Handler & Room Engine Empirical Stress Tests', () => {
  let app: FastifyInstance;
  let port: number;
  let serverUrl: string;

  beforeAll(async () => {
    app = await buildApp({ dbPath: ':memory:', logger: false });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    port = typeof address === 'object' && address ? address.port : 4000;
    serverUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await app.close();
    closeDatabase();
  });

  const createConnectedSocket = async (): Promise<ClientSocket> => {
    const socket = Client(serverUrl, {
      transports: ['websocket'],
      forceNew: true,
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Socket connect timeout')), 3000);
      socket.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    return socket;
  };

  describe('Adversarial Permission Bypass Probing', () => {
    let hostSocket: ClientSocket;
    let guestSocket1: ClientSocket;
    let guestSocket2: ClientSocket;
    let unjoinedSocket: ClientSocket;
    const roomCode = 'SEC_ROOM_01';

    beforeAll(async () => {
      hostSocket = await createConnectedSocket();
      guestSocket1 = await createConnectedSocket();
      guestSocket2 = await createConnectedSocket();
      unjoinedSocket = await createConnectedSocket();

      // Host joins
      const hostJoined = new Promise<any>((resolve) => hostSocket.on('room:joined', resolve));
      hostSocket.emit('room:join', {
        roomCode,
        user: { id: 'host_admin', name: 'HostAdmin' },
      });
      await hostJoined;

      // Ensure room is in HOST_ONLY mode
      hostSocket.emit('room:set_permission', { roomCode, permissionMode: 'HOST_ONLY' });

      // Guests join
      const g1Joined = new Promise<any>((resolve) => guestSocket1.on('room:joined', resolve));
      guestSocket1.emit('room:join', {
        roomCode,
        user: { id: 'guest_attacker', name: 'Attacker' },
      });
      await g1Joined;

      const g2Joined = new Promise<any>((resolve) => guestSocket2.on('room:joined', resolve));
      guestSocket2.emit('room:join', {
        roomCode,
        user: { id: 'guest_innocent', name: 'Innocent' },
      });
      await g2Joined;
    });

    afterAll(() => {
      [hostSocket, guestSocket1, guestSocket2, unjoinedSocket].forEach((s) => {
        if (s?.connected) s.disconnect();
      });
    });

    it('should reject non-host media:play and emit permission:denied', async () => {
      let syncReceived = false;
      const syncListener = () => { syncReceived = true; };
      guestSocket2.on('media:sync', syncListener);

      const deniedPromise = new Promise<any>((resolve) =>
        guestSocket1.once('permission:denied', resolve)
      );

      guestSocket1.emit('media:play', {
        roomCode,
        currentTime: 42.0,
        clientTimestamp: Date.now(),
      });

      const denied = await deniedPromise;
      expect(denied.code).toBe('PERMISSION_DENIED');
      expect(denied.action).toBe('media:play');

      // Ensure no sync broadcast was leaked
      await new Promise((r) => setTimeout(r, 50));
      expect(syncReceived).toBe(false);
      guestSocket2.off('media:sync', syncListener);
    });

    it('should reject non-host media:pause and emit permission:denied', async () => {
      const deniedPromise = new Promise<any>((resolve) =>
        guestSocket1.once('permission:denied', resolve)
      );

      guestSocket1.emit('media:pause', {
        roomCode,
        currentTime: 42.0,
        clientTimestamp: Date.now(),
      });

      const denied = await deniedPromise;
      expect(denied.code).toBe('PERMISSION_DENIED');
      expect(denied.action).toBe('media:pause');
    });

    it('should reject non-host media:seek and emit permission:denied', async () => {
      const deniedPromise = new Promise<any>((resolve) =>
        guestSocket1.once('permission:denied', resolve)
      );

      guestSocket1.emit('media:seek', {
        roomCode,
        targetTime: 99.0,
        clientTimestamp: Date.now(),
      });

      const denied = await deniedPromise;
      expect(denied.code).toBe('PERMISSION_DENIED');
      expect(denied.action).toBe('media:seek');
    });

    it('should reject non-host media:change and emit permission:denied', async () => {
      const deniedPromise = new Promise<any>((resolve) =>
        guestSocket1.once('permission:denied', resolve)
      );

      guestSocket1.emit('media:change', {
        roomCode,
        mediaUrl: 'https://example.com/malicious.mp4',
      });

      const denied = await deniedPromise;
      expect(denied.code).toBe('PERMISSION_DENIED');
      expect(denied.action).toBe('media:change');
    });

    it('should reject non-host room:set_permission escalation attempt', async () => {
      const deniedPromise = new Promise<any>((resolve) =>
        guestSocket1.once('permission:denied', resolve)
      );

      guestSocket1.emit('room:set_permission', {
        roomCode,
        permissionMode: 'SHARED',
      });

      const denied = await deniedPromise;
      expect(denied.code).toBe('PERMISSION_DENIED');
      expect(denied.action).toBe('room:set_permission');
    });

    it('should safely ignore media actions from unjoined / unauthenticated sockets without crash', async () => {
      // Socket without joining room tries to send media action
      unjoinedSocket.emit('media:play', {
        roomCode: 'NON_EXISTENT_ROOM',
        currentTime: 10.0,
      });

      unjoinedSocket.emit('media:pause', {
        roomCode, // Valid room, but socket never joined and has no userId
        currentTime: 10.0,
      });

      // No crash occurs
      await new Promise((r) => setTimeout(r, 50));
      expect(unjoinedSocket.connected).toBe(true);
    });
  });

  describe('Rapid Burst Events & Monotonic Versioning Stress Test', () => {
    let host: ClientSocket;
    const clients: ClientSocket[] = [];
    const roomCode = 'BURST_ROOM_02';

    beforeAll(async () => {
      host = await createConnectedSocket();
      const hostJoined = new Promise<any>((resolve) => host.on('room:joined', resolve));
      host.emit('room:join', {
        roomCode,
        user: { id: 'burst_host', name: 'BurstHost' },
      });
      await hostJoined;

      // Set to SHARED so all clients can emit concurrently
      host.emit('room:set_permission', { roomCode, permissionMode: 'SHARED' });

      for (let i = 0; i < 4; i++) {
        const client = await createConnectedSocket();
        const joined = new Promise<any>((resolve) => client.on('room:joined', resolve));
        client.emit('room:join', {
          roomCode,
          user: { id: `burst_client_${i}`, name: `Client${i}` },
        });
        await joined;
        clients.push(client);
      }
    });

    afterAll(() => {
      host.disconnect();
      clients.forEach((c) => c.disconnect());
    });

    it('should maintain strict monotonic versioning during a concurrent burst of 50 media actions', async () => {
      const allSockets = [host, ...clients];
      const receivedVersions: number[] = [];
      const totalEvents = 50;

      // Listen for media:sync on observer client (clients[0])
      const syncCollector = new Promise<void>((resolve) => {
        clients[0].on('media:sync', (payload) => {
          receivedVersions.push(payload.version);
          if (receivedVersions.length === totalEvents) {
            resolve();
          }
        });
      });

      // Fire 50 rapid interleaved play/pause/seek events from all 5 sockets simultaneously
      const promises: Promise<void>[] = [];
      for (let i = 0; i < totalEvents; i++) {
        const socketIndex = i % allSockets.length;
        const sock = allSockets[socketIndex];
        const eventType = i % 3;

        if (eventType === 0) {
          sock.emit('media:play', {
            roomCode,
            currentTime: i * 2.5,
            clientTimestamp: Date.now(),
          });
        } else if (eventType === 1) {
          sock.emit('media:pause', {
            roomCode,
            currentTime: i * 2.5,
            clientTimestamp: Date.now(),
          });
        } else {
          sock.emit('media:seek', {
            roomCode,
            targetTime: i * 3.0,
            clientTimestamp: Date.now(),
          });
        }
      }

      await syncCollector;

      expect(receivedVersions.length).toBe(totalEvents);

      // Assert strictly monotonic versions: version[k] > version[k-1]
      for (let k = 1; k < receivedVersions.length; k++) {
        expect(receivedVersions[k]).toBeGreaterThan(receivedVersions[k - 1]);
      }
    });
  });

  describe('Rapid Host Handover & Permission Re-evaluation', () => {
    let userA: ClientSocket;
    let userB: ClientSocket;
    const roomCode = 'HANDOVER_ROOM';

    beforeAll(async () => {
      userA = await createConnectedSocket();
      userB = await createConnectedSocket();
    });

    afterAll(() => {
      if (userA.connected) userA.disconnect();
      if (userB.connected) userB.disconnect();
    });

    it('should elect next member as host on disconnect and revoke old host controls when rejoining', async () => {
      // User A joins first -> becomes host
      const aJoined = new Promise<any>((resolve) => userA.on('room:joined', resolve));
      userA.emit('room:join', {
        roomCode,
        user: { id: 'user_a', name: 'UserA' },
      });
      const aData = await aJoined;
      expect(aData.user.isHost).toBe(true);

      // User B joins -> member
      const bJoined = new Promise<any>((resolve) => userB.on('room:joined', resolve));
      userB.emit('room:join', {
        roomCode,
        user: { id: 'user_b', name: 'UserB' },
      });
      const bData = await bJoined;
      expect(bData.user.isHost).toBe(false);

      // User B receives member_left and newHostId when User A disconnects
      const hostTransferPromise = new Promise<any>((resolve) => {
        userB.on('room:member_left', resolve);
      });

      // User A disconnects
      userA.disconnect();
      const leftEvent = await hostTransferPromise;
      expect(leftEvent.userId).toBe('user_a');
      expect(leftEvent.newHostId).toBe('user_b');

      // User B can now control playback (is now host)
      const bSyncPromise = new Promise<any>((resolve) => userB.on('media:sync', resolve));
      userB.emit('media:play', {
        roomCode,
        currentTime: 10.0,
        clientTimestamp: Date.now(),
      });
      const bSync = await bSyncPromise;
      expect(bSync.state).toBe('PLAYING');
      expect(bSync.issuerId).toBe('user_b');

      // User A reconnects with a fresh socket
      const userAReconnected = await createConnectedSocket();
      const aRejoinedPromise = new Promise<any>((resolve) =>
        userAReconnected.on('room:joined', resolve)
      );
      userAReconnected.emit('room:join', {
        roomCode,
        user: { id: 'user_a', name: 'UserA' },
      });
      const aRejoinedData = await aRejoinedPromise;
      expect(aRejoinedData.user.isHost).toBe(false);
      expect(aRejoinedData.room.hostId).toBe('user_b');

      // User A attempts to control playback -> should be DENIED!
      const aDeniedPromise = new Promise<any>((resolve) =>
        userAReconnected.on('permission:denied', resolve)
      );
      userAReconnected.emit('media:pause', {
        roomCode,
        currentTime: 10.0,
        clientTimestamp: Date.now(),
      });

      const aDenied = await aDeniedPromise;
      expect(aDenied.code).toBe('PERMISSION_DENIED');
      expect(aDenied.action).toBe('media:pause');

      userAReconnected.disconnect();
    });
  });

  describe('NTP Sync High Throughput Ping Burst (50 concurrent pings)', () => {
    let client: ClientSocket;

    beforeAll(async () => {
      client = await createConnectedSocket();
    });

    afterAll(() => {
      if (client.connected) client.disconnect();
    });

    it('should respond to 50 concurrent sync:ping events with matched sequences and valid timestamps', async () => {
      const pingsCount = 50;
      const responses: any[] = [];

      const allPongsPromise = new Promise<void>((resolve) => {
        client.on('sync:pong', (data) => {
          responses.push(data);
          if (responses.length === pingsCount) {
            resolve();
          }
        });
      });

      for (let seq = 1; seq <= pingsCount; seq++) {
        client.emit('sync:ping', {
          clientTimestamp: 1700000000000 + seq * 10,
          clientSequence: seq,
        });
      }

      await allPongsPromise;

      expect(responses.length).toBe(pingsCount);
      for (let seq = 1; seq <= pingsCount; seq++) {
        const matching = responses.find((r) => r.clientSequence === seq);
        expect(matching).toBeDefined();
        expect(matching.clientTimestamp).toBe(1700000000000 + seq * 10);
        expect(matching.serverTimestamp).toBeGreaterThan(0);
      }
    });
  });

  describe('Pause Latency Budget Benchmark (50 iterations)', () => {
    let host: ClientSocket;
    let observer: ClientSocket;
    const roomCode = 'LATENCY_BENCH';

    beforeAll(async () => {
      host = await createConnectedSocket();
      observer = await createConnectedSocket();

      const hostJoined = new Promise<any>((r) => host.on('room:joined', r));
      host.emit('room:join', { roomCode, user: { id: 'host_bench', name: 'BenchHost' } });
      await hostJoined;

      const observerJoined = new Promise<any>((r) => observer.on('room:joined', r));
      observer.emit('room:join', { roomCode, user: { id: 'obs_bench', name: 'BenchObserver' } });
      await observerJoined;
    });

    afterAll(() => {
      host.disconnect();
      observer.disconnect();
    });

    it('should deliver pause sync events in <= 200ms across 50 consecutive cycles', async () => {
      const latencies: number[] = [];

      for (let i = 0; i < 50; i++) {
        const start = Date.now();
        const syncPromise = new Promise<any>((resolve) => observer.once('media:sync', resolve));

        host.emit('media:pause', {
          roomCode,
          currentTime: i * 1.5,
          clientTimestamp: start,
        });

        const sync = await syncPromise;
        const elapsed = Date.now() - start;
        latencies.push(elapsed);

        expect(sync.state).toBe('PAUSED');
        expect(elapsed).toBeLessThan(200); // Acceptance criteria budget
      }

      latencies.sort((a, b) => a - b);
      const p50 = latencies[Math.floor(latencies.length * 0.5)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const p99 = latencies[Math.floor(latencies.length * 0.99)];
      const maxLatency = latencies[latencies.length - 1];

      // Local engine round-trip is typically < 10ms
      expect(p50).toBeLessThan(50);
      expect(p95).toBeLessThan(100);
      expect(maxLatency).toBeLessThan(200);
    });
  });
});
