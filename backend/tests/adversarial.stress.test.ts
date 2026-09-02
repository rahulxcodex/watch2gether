import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { buildApp } from '../src/app';
import { closeDatabase, getDb } from '../src/db/db';
import { messages } from '../src/db/schema';
import { eq } from 'drizzle-orm';

describe('Empirical Adversarial Stress & Edge Case Test Suite', () => {
  let app: FastifyInstance;
  let port: number;
  const activeSockets: ClientSocket[] = [];

  const createSocket = async (): Promise<ClientSocket> => {
    const socket = Client(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    activeSockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Socket connect timeout')), 4000);
      socket.on('connect', () => {
        clearTimeout(timeout);
        resolve();
      });
      socket.on('connect_error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
    return socket;
  };

  beforeAll(async () => {
    app = await buildApp({ dbPath: ':memory:', logger: false });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    port = typeof address === 'object' && address ? address.port : 4001;
  });

  afterAll(async () => {
    for (const socket of activeSockets) {
      if (socket.connected) socket.disconnect();
    }
    await app.close();
    closeDatabase();
  });

  // ==========================================
  // AREA 1: Rapid Concurrent REST & DB Stress
  // ==========================================
  describe('Area 1: Concurrent REST Requests & DB Pressure', () => {
    it('should handle 50 concurrent guest auth requests without locks or data loss', async () => {
      const promises = Array.from({ length: 50 }).map((_, idx) =>
        app.inject({
          method: 'POST',
          url: '/api/auth/guest',
          payload: { name: `GuestConcurrent_${idx}` },
        })
      );

      const responses = await Promise.all(promises);
      expect(responses).toHaveLength(50);

      const userIds = new Set<string>();
      for (const res of responses) {
        expect(res.statusCode).toBe(200);
        const data = JSON.parse(res.body);
        expect(data).toHaveProperty('token');
        expect(data.user).toBeDefined();
        expect(data.user.id).toMatch(/^usr_/);
        userIds.add(data.user.id);
      }
      expect(userIds.size).toBe(50);
    });

    it('should handle 50 concurrent unauthenticated room creations with auto-provisioning', async () => {
      const promises = Array.from({ length: 50 }).map((_, idx) =>
        app.inject({
          method: 'POST',
          url: '/api/rooms',
          payload: { name: `AutoRoom_${idx}`, permissionMode: 'HOST_ONLY' },
        })
      );

      const responses = await Promise.all(promises);
      expect(responses).toHaveLength(50);

      const roomCodes = new Set<string>();
      const roomIds = new Set<string>();
      for (const res of responses) {
        expect(res.statusCode).toBe(201);
        const data = JSON.parse(res.body);
        expect(data.roomCode).toHaveLength(6);
        expect(data.hostId).toMatch(/^usr_/);
        roomCodes.add(data.roomCode);
        roomIds.add(data.id);
      }
      expect(roomCodes.size).toBe(50);
      expect(roomIds.size).toBe(50);
    });
  });

  // ==========================================
  // AREA 2: Input Validation & Adversarial Payloads
  // ==========================================
  describe('Area 2: Malformed Inputs & Security Boundary Testing', () => {
    it('should reject invalid guest payloads (empty name, oversized name, invalid url)', async () => {
      const invalidPayloads = [
        { name: '' },
        { name: 'X'.repeat(51) },
        { avatar: 'not-a-valid-url' },
        { name: 12345 },
      ];

      for (const payload of invalidPayloads) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/auth/guest',
          payload,
        });
        expect(res.statusCode).toBe(400);
        const body = JSON.parse(res.body);
        expect(body.error).toBe('BadRequest');
      }
    });

    it('should reject invalid room creation payloads (empty name, oversized name, invalid enums)', async () => {
      const invalidPayloads = [
        { name: '' },
        { name: 'Y'.repeat(101) },
        { mediaType: 'WEBM' },
        { permissionMode: 'OPEN' },
      ];

      for (const payload of invalidPayloads) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/rooms',
          payload,
        });
        expect(res.statusCode).toBe(400);
      }
    });

    it('should safely handle SQL injection strings in room names and lookups without leaking or crashing', async () => {
      const sqlInjectionName = "Room '; DROP TABLE rooms; --";
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/rooms',
        payload: { name: sqlInjectionName },
      });
      expect(createRes.statusCode).toBe(201);
      const created = JSON.parse(createRes.body);
      expect(created.name).toBe(sqlInjectionName);

      const lookupRes = await app.inject({
        method: 'GET',
        url: `/api/rooms/${created.roomCode}`,
      });
      expect(lookupRes.statusCode).toBe(200);

      const badParamRes = await app.inject({
        method: 'GET',
        url: "/api/rooms/' OR 1=1 --",
      });
      expect(badParamRes.statusCode).toBe(404);
    });

    it('should safely handle XSS strings in room names', async () => {
      const xssName = '<script>alert("xss")</script><img src=x onerror=alert(1)>';
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/rooms',
        payload: { name: xssName },
      });
      expect(createRes.statusCode).toBe(201);
      const created = JSON.parse(createRes.body);
      expect(created.name).toBe(xssName);
    });
  });

  // ==========================================
  // AREA 3: Participant Limits, Disconnects & Host Migration
  // ==========================================
  describe('Area 3: WebSocket Participant Limits & Host Migration', () => {
    it('should handle 30 simultaneous sockets in a single room with synchronized state', async () => {
      const roomCode = 'MASS30';
      const sockets: ClientSocket[] = [];

      for (let i = 0; i < 30; i++) {
        const s = await createSocket();
        sockets.push(s);
      }

      const hostJoinedPromise = new Promise<any>((resolve) => sockets[0].on('room:joined', resolve));
      sockets[0].emit('room:join', {
        roomCode,
        user: { id: 'host_mass', name: 'MassHost' },
      });
      const hostJoined = await hostJoinedPromise;
      expect(hostJoined.user.isHost).toBe(true);

      const joinPromises = sockets.slice(1).map((s, idx) => {
        return new Promise<any>((resolve) => {
          s.on('room:joined', resolve);
          s.emit('room:join', {
            roomCode,
            user: { id: `guest_mass_${idx + 1}`, name: `Guest_${idx + 1}` },
          });
        });
      });

      const joinedResults = await Promise.all(joinPromises);
      for (const res of joinedResults) {
        expect(res.room.roomCode).toBe(roomCode);
        expect(res.user.isHost).toBe(false);
        expect(res.room.hostId).toBe('host_mass');
      }

      for (const s of sockets) {
        s.disconnect();
      }
      await new Promise((r) => setTimeout(r, 100));
    });

    it('should correctly migrate host role to the oldest remaining member when host disconnects', async () => {
      const roomCode = 'MIGRATE1';
      const s1 = await createSocket();
      const s2 = await createSocket();
      const s3 = await createSocket();

      const s1Joined = new Promise<any>((resolve) => s1.on('room:joined', resolve));
      s1.emit('room:join', { roomCode, user: { id: 'user_1', name: 'User 1' } });
      await s1Joined;

      await new Promise((r) => setTimeout(r, 50));

      const s2Joined = new Promise<any>((resolve) => s2.on('room:joined', resolve));
      s2.emit('room:join', { roomCode, user: { id: 'user_2', name: 'User 2' } });
      await s2Joined;

      await new Promise((r) => setTimeout(r, 50));

      const s3Joined = new Promise<any>((resolve) => s3.on('room:joined', resolve));
      s3.emit('room:join', { roomCode, user: { id: 'user_3', name: 'User 3' } });
      await s3Joined;

      const s2LeftPromise = new Promise<any>((resolve) => s2.on('room:member_left', resolve));
      const s3LeftPromise = new Promise<any>((resolve) => s3.on('room:member_left', resolve));

      s1.disconnect();

      const [s2LeftEvent, s3LeftEvent] = await Promise.all([s2LeftPromise, s3LeftPromise]);
      expect(s2LeftEvent.userId).toBe('user_1');
      expect(s2LeftEvent.participantCount).toBe(2);
      expect(s2LeftEvent.newHostId).toBe('user_2');
      expect(s3LeftEvent.newHostId).toBe('user_2');

      const syncPromise = new Promise<any>((resolve) => s3.on('media:sync', resolve));
      s2.emit('media:play', { roomCode, currentTime: 10.0, clientTimestamp: Date.now() });
      const sync = await syncPromise;
      expect(sync.state).toBe('PLAYING');
      expect(sync.currentTime).toBe(10.0);
      expect(sync.issuerId).toBe('user_2');

      const deniedPromise = new Promise<any>((resolve) => s3.on('permission:denied', resolve));
      s3.emit('media:pause', { roomCode, currentTime: 10.0, clientTimestamp: Date.now() });
      const denied = await deniedPromise;
      expect(denied.code).toBe('PERMISSION_DENIED');

      s2.disconnect();
      s3.disconnect();
      await new Promise((r) => setTimeout(r, 100));
    });

    it('should reassign host when all users leave and a new user joins later', async () => {
      const roomCode = 'EMPTYREJOIN';
      const s1 = await createSocket();

      const s1Joined = new Promise<any>((resolve) => s1.on('room:joined', resolve));
      s1.emit('room:join', { roomCode, user: { id: 'initial_host', name: 'Initial Host' } });
      const joined1 = await s1Joined;
      expect(joined1.user.isHost).toBe(true);

      s1.disconnect();
      await new Promise((r) => setTimeout(r, 100));

      const s2 = await createSocket();
      const s2Joined = new Promise<any>((resolve) => s2.on('room:joined', resolve));
      s2.emit('room:join', { roomCode, user: { id: 'new_entrant', name: 'New Entrant' } });
      const joined2 = await s2Joined;
      expect(joined2.user.isHost).toBe(true);

      s2.disconnect();
      await new Promise((r) => setTimeout(r, 50));
    });
  });

  // ==========================================
  // AREA 4: Chat & Emoji Reaction Flood Throttling
  // ==========================================
  describe('Area 4: Chat & Emoji Burst Flood Rate-Limiting', () => {
    it('should throttle emoji bursts to REACTION_RATE_LIMIT_MS (drop rapid spam)', async () => {
      const roomCode = 'EMOJISPAM';
      const sender = await createSocket();
      const receiver = await createSocket();

      sender.emit('room:join', { roomCode, user: { id: 'sender_u', name: 'Sender' } });
      receiver.emit('room:join', { roomCode, user: { id: 'receiver_u', name: 'Receiver' } });
      await new Promise((r) => setTimeout(r, 100));

      const receivedBursts: any[] = [];
      receiver.on('reaction:burst', (data) => {
        receivedBursts.push(data);
      });

      for (let i = 0; i < 20; i++) {
        sender.emit('reaction:send', { roomCode, emoji: '🔥', x: 0.5 });
      }

      await new Promise((r) => setTimeout(r, 300));

      expect(receivedBursts.length).toBe(1);

      await new Promise((r) => setTimeout(r, 200));
      sender.emit('reaction:send', { roomCode, emoji: '❤️', x: 0.8 });
      await new Promise((r) => setTimeout(r, 50));

      expect(receivedBursts.length).toBe(2);
      expect(receivedBursts[1].emoji).toBe('❤️');

      sender.disconnect();
      receiver.disconnect();
    });

    it('should drop empty and oversized chat messages (>500 chars)', async () => {
      const roomCode = 'CHATLIMIT';
      const sender = await createSocket();
      const receiver = await createSocket();

      sender.emit('room:join', { roomCode, user: { id: 'chat_sender', name: 'ChatSender' } });
      receiver.emit('room:join', { roomCode, user: { id: 'chat_receiver', name: 'ChatReceiver' } });
      await new Promise((r) => setTimeout(r, 100));

      const receivedMessages: any[] = [];
      receiver.on('chat:message', (data) => {
        receivedMessages.push(data);
      });

      sender.emit('chat:send', { roomCode, text: '' });
      sender.emit('chat:send', { roomCode, text: '   ' });
      sender.emit('chat:send', { roomCode, text: 'A'.repeat(501) });
      sender.emit('chat:send', { roomCode, text: 'B'.repeat(500) });
      sender.emit('chat:send', { roomCode, text: 'Hello Watch2Gether!' });

      await new Promise((r) => setTimeout(r, 200));

      expect(receivedMessages.length).toBe(2);
      expect(receivedMessages[0].text).toHaveLength(500);
      expect(receivedMessages[1].text).toBe('Hello Watch2Gether!');

      sender.disconnect();
      receiver.disconnect();
    });

    it('should broadcast and persist high-volume chat burst for REST-provisioned room and user', async () => {
      const userRes = await app.inject({
        method: 'POST',
        url: '/api/auth/guest',
        payload: { name: 'BurstUser' },
      });
      const userData = JSON.parse(userRes.body);

      const roomRes = await app.inject({
        method: 'POST',
        url: '/api/rooms',
        headers: { authorization: `Bearer ${userData.token}` },
        payload: { name: 'Burst Room' },
      });
      const roomData = JSON.parse(roomRes.body);

      const sender = await createSocket();
      const receiver = await createSocket();

      sender.emit('room:join', { roomCode: roomData.roomCode, user: { id: userData.user.id, name: userData.user.name } });
      receiver.emit('room:join', { roomCode: roomData.roomCode, user: { id: 'rcv_usr', name: 'Receiver' } });
      await new Promise((r) => setTimeout(r, 100));

      const receivedMessages: any[] = [];
      receiver.on('chat:message', (data) => {
        receivedMessages.push(data);
      });

      for (let i = 0; i < 50; i++) {
        sender.emit('chat:send', { roomCode: roomData.roomCode, text: `Burst message #${i + 1}` });
      }

      await new Promise((r) => setTimeout(r, 500));

      expect(receivedMessages.length).toBe(50);

      const db = getDb();
      const dbMessages = db
        .select()
        .from(messages)
        .where(eq(messages.roomCode, roomData.roomCode))
        .all();
      expect(dbMessages.length).toBe(50);

      sender.disconnect();
      receiver.disconnect();
    });
  });

  // ==========================================
  // AREA 5: State Machine Monotonicity & Projection Math
  // ==========================================
  describe('Area 5: Playback State Projection & Monotonic Versioning', () => {
    it('should monotonically increment version on consecutive playback mutations', async () => {
      const roomCode = 'VERSIONTEST';
      const host = await createSocket();
      const versions: number[] = [];

      host.on('media:sync', (data) => {
        versions.push(data.version);
      });

      host.emit('room:join', { roomCode, user: { id: 'version_host', name: 'VHost' } });
      await new Promise((r) => setTimeout(r, 100));

      host.emit('media:play', { roomCode, currentTime: 0 });
      await new Promise((r) => setTimeout(r, 50));

      host.emit('media:seek', { roomCode, targetTime: 30 });
      await new Promise((r) => setTimeout(r, 50));

      host.emit('media:pause', { roomCode, currentTime: 30 });
      await new Promise((r) => setTimeout(r, 50));

      host.emit('media:change', { roomCode, mediaUrl: 'https://example.com/video.mp4', mediaType: 'MP4' });
      await new Promise((r) => setTimeout(r, 50));

      expect(versions.length).toBe(4);
      for (let i = 1; i < versions.length; i++) {
        expect(versions[i]).toBeGreaterThan(versions[i - 1]);
      }

      host.disconnect();
    });

    it('should accurately calculate clock offset and RTT via Cristian NTP handshake', async () => {
      const socket = await createSocket();
      const clientSend = Date.now();

      const pongPromise = new Promise<any>((resolve) => socket.on('sync:pong', resolve));
      socket.emit('sync:ping', { clientTimestamp: clientSend, clientSequence: 42 });

      const pong = await pongPromise;
      const clientReceive = Date.now();
      const roundTripTime = clientReceive - clientSend;
      const estimatedServerTime = pong.serverTimestamp + roundTripTime / 2;
      const clockOffset = estimatedServerTime - clientReceive;

      expect(pong.clientTimestamp).toBe(clientSend);
      expect(pong.clientSequence).toBe(42);
      expect(roundTripTime).toBeLessThan(100);
      expect(Math.abs(clockOffset)).toBeLessThan(1000);

      socket.disconnect();
    });
  });
});