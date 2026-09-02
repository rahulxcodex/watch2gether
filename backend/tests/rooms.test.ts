import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { closeDatabase } from '../src/db/db';

describe('Rooms REST API', () => {
  let app: FastifyInstance;
  let userToken: string;
  let userId: string;

  beforeAll(async () => {
    app = await buildApp({ dbPath: ':memory:', logger: false });
    await app.ready();

    // Create a user first
    const authRes = await app.inject({
      method: 'POST',
      url: '/api/auth/guest',
      payload: { name: 'HostAlice' },
    });
    const authBody = JSON.parse(authRes.body);
    userToken = authBody.token;
    userId = authBody.user.id;
  });

  afterAll(async () => {
    await app.close();
    closeDatabase();
  });

  it('should create a room when authenticated with Bearer token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: {
        authorization: `Bearer ${userToken}`,
      },
      payload: {
        name: 'Movie Night Room',
        mediaUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        mediaType: 'MP4',
        permissionMode: 'HOST_ONLY',
      },
    });

    expect(res.statusCode).toBe(201);
    const room = JSON.parse(res.body);
    expect(room).toHaveProperty('id');
    expect(room).toHaveProperty('roomCode');
    expect(room.name).toBe('Movie Night Room');
    expect(room.hostId).toBe(userId);
    expect(room.mediaType).toBe('MP4');
    expect(room.permissionMode).toBe('HOST_ONLY');
    expect(room.playbackState).toBe('IDLE');
    expect(room.currentTime).toBe(0);
  });

  it('should auto-create a guest and room if unauthenticated', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      payload: {
        name: 'Instant Room',
      },
    });

    expect(res.statusCode).toBe(201);
    const room = JSON.parse(res.body);
    expect(room.roomCode).toHaveLength(6);
    expect(room.hostId).toMatch(/^usr_/);
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('should fetch room metadata by roomCode', async () => {
    // Create room first
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Lookup Room' },
    });
    const created = JSON.parse(createRes.body);

    const getRes = await app.inject({
      method: 'GET',
      url: `/api/rooms/${created.roomCode}`,
    });

    expect(getRes.statusCode).toBe(200);
    const fetched = JSON.parse(getRes.body);
    expect(fetched.id).toBe(created.id);
    expect(fetched.roomCode).toBe(created.roomCode);
    expect(fetched.name).toBe('Lookup Room');
    expect(fetched.hostId).toBe(userId);
  });

  it('should return 404 for non-existent room code', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/rooms/NONEXISTENT999',
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('NotFound');
  });
});
