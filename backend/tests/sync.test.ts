import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { buildApp } from '../src/app';
import { closeDatabase } from '../src/db/db';

describe('WebSocket Real-Time Sync Engine', () => {
  let app: FastifyInstance;
  let port: number;
  let hostSocket: ClientSocket;
  let guestSocket: ClientSocket;

  beforeAll(async () => {
    app = await buildApp({ dbPath: ':memory:', logger: false });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    port = typeof address === 'object' && address ? address.port : 4000;
  });

  afterAll(async () => {
    if (hostSocket && hostSocket.connected) hostSocket.disconnect();
    if (guestSocket && guestSocket.connected) guestSocket.disconnect();
    await app.close();
    closeDatabase();
  });

  it('1. should perform NTP clock sync (sync:ping / sync:pong)', async () => {
    hostSocket = Client(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      forceNew: true,
    });

    await new Promise<void>((resolve) => hostSocket.on('connect', () => resolve()));

    const clientSendTime = Date.now();
    const pongPromise = new Promise<{ clientTimestamp: number; serverTimestamp: number }>((resolve) => {
      hostSocket.on('sync:pong', resolve);
    });

    hostSocket.emit('sync:ping', { clientTimestamp: clientSendTime, clientSequence: 1 });
    const pong = await pongPromise;

    expect(pong.clientTimestamp).toBe(clientSendTime);
    expect(pong.serverTimestamp).toBeGreaterThan(0);
    expect(Math.abs(Date.now() - pong.serverTimestamp)).toBeLessThan(2000);
  });

  it('2. should join room as Host and receive initial state snapshot', async () => {
    const joinedPromise = new Promise<any>((resolve) => hostSocket.on('room:joined', resolve));

    hostSocket.emit('room:join', {
      roomCode: 'SYNC101',
      user: { id: 'host_alice', name: 'HostAlice' },
    });

    const joined = await joinedPromise;
    expect(joined.room.roomCode).toBe('SYNC101');
    expect(joined.room.hostId).toBe('host_alice');
    expect(joined.users.length).toBe(1);
    expect(joined.users[0].isHost).toBe(true);
    expect(joined.playbackState.status).toBe('IDLE');
  });

  it('3. should join room as Guest and broadcast member_joined to peers', async () => {
    guestSocket = Client(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      forceNew: true,
    });

    await new Promise<void>((resolve) => guestSocket.on('connect', () => resolve()));

    const peerBroadcastPromise = new Promise<any>((resolve) =>
      hostSocket.on('room:member_joined', resolve)
    );
    const guestJoinedPromise = new Promise<any>((resolve) =>
      guestSocket.on('room:joined', resolve)
    );

    guestSocket.emit('room:join', {
      roomCode: 'SYNC101',
      user: { id: 'guest_bob', name: 'GuestBob' },
    });

    const [peerBroadcast, guestJoined] = await Promise.all([
      peerBroadcastPromise,
      guestJoinedPromise,
    ]);

    expect(guestJoined.room.hostId).toBe('host_alice');
    expect(guestJoined.users.length).toBe(2);
    expect(peerBroadcast.user.id).toBe('guest_bob');
    expect(peerBroadcast.participantCount).toBe(2);
  });

  it('4. should reject Guest media:play in HOST_ONLY mode with permission:denied', async () => {
    const deniedPromise = new Promise<any>((resolve) =>
      guestSocket.on('permission:denied', resolve)
    );

    guestSocket.emit('media:play', {
      roomCode: 'SYNC101',
      currentTime: 10.0,
      clientTimestamp: Date.now(),
    });

    const denied = await deniedPromise;
    expect(denied.code).toBe('PERMISSION_DENIED');
    expect(denied.action).toBe('media:play');
  });

  it('5. should allow Host media:play and broadcast media:sync with monotonic version', async () => {
    const syncPromise = new Promise<any>((resolve) => guestSocket.on('media:sync', resolve));

    hostSocket.emit('media:play', {
      roomCode: 'SYNC101',
      currentTime: 15.0,
      clientTimestamp: Date.now(),
    });

    const sync = await syncPromise;
    expect(sync.state).toBe('PLAYING');
    expect(sync.currentTime).toBe(15.0);
    expect(sync.version).toBeGreaterThanOrEqual(2);
    expect(sync.issuerId).toBe('host_alice');
  });

  it('6. should allow Host media:pause and broadcast <=200ms latency budget', async () => {
    const start = Date.now();
    const syncPromise = new Promise<any>((resolve) => guestSocket.on('media:sync', resolve));

    hostSocket.emit('media:pause', {
      roomCode: 'SYNC101',
      currentTime: 22.5,
      clientTimestamp: start,
    });

    const sync = await syncPromise;
    const elapsed = Date.now() - start;

    expect(sync.state).toBe('PAUSED');
    expect(sync.currentTime).toBe(22.5);
    expect(elapsed).toBeLessThan(200);
  });

  it('7. should allow Host media:seek and broadcast updated playhead', async () => {
    const syncPromise = new Promise<any>((resolve) => guestSocket.on('media:sync', resolve));

    hostSocket.emit('media:seek', {
      roomCode: 'SYNC101',
      targetTime: 45.0,
      clientTimestamp: Date.now(),
    });

    const sync = await syncPromise;
    expect(sync.currentTime).toBe(45.0);
    expect(sync.issuerId).toBe('host_alice');
  });

  it('8. should allow Host to switch to SHARED permission mode and allow Guest control', async () => {
    const permPromise = new Promise<any>((resolve) =>
      guestSocket.on('room:permission_updated', resolve)
    );

    hostSocket.emit('room:set_permission', {
      roomCode: 'SYNC101',
      permissionMode: 'SHARED',
    });

    const perm = await permPromise;
    expect(perm.permissionMode).toBe('SHARED');

    // Now guest plays
    const syncPromise = new Promise<any>((resolve) => hostSocket.on('media:sync', resolve));
    guestSocket.emit('media:play', {
      roomCode: 'SYNC101',
      currentTime: 50.0,
      clientTimestamp: Date.now(),
    });

    const sync = await syncPromise;
    expect(sync.state).toBe('PLAYING');
    expect(sync.currentTime).toBe(50.0);
    expect(sync.issuerId).toBe('guest_bob');
  });
});
