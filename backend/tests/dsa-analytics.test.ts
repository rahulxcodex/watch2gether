import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { buildApp } from '../src/app';
import { closeDatabase } from '../src/db/db';

describe('DSA & Data Science Backend Integration Tests', () => {
  let app: FastifyInstance;
  let port: number;
  let client: ClientSocket;

  beforeAll(async () => {
    app = await buildApp({ dbPath: ':memory:', logger: false });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    port = typeof address === 'object' && address ? address.port : 4000;

    client = Client(`http://127.0.0.1:${port}`, { transports: ['websocket'], forceNew: true });
    await new Promise<void>((r) => client.on('connect', () => r()));
  });

  afterAll(async () => {
    if (client.connected) client.disconnect();
    await app.close();
    closeDatabase();
  });

  it('GET /api/analytics/concurrency should return sweep-line concurrency statistics', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/analytics/concurrency',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(typeof body.data.peakCount).toBe('number');
  });

  it('GET /api/analytics/stats should return descriptive stats metrics', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/analytics/stats',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.totalRooms).toBeDefined();
    expect(body.data.totalUsers).toBeDefined();
  });

  it('GET /api/recommendations should return media recommendations', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/recommendations',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('should support queue operations (add, reorder, upvote) via socket', async () => {
    const roomCode = 'DSA_ROOM';
    client.emit('room:join', {
      roomCode,
      user: { id: 'user_tester', name: 'Tester', avatarColor: '#10b981' },
    });
    await new Promise((r) => setTimeout(r, 50));

    // Add 2 items
    client.emit('queue:add', {
      roomCode,
      item: { id: 'q1', title: 'Video 1', url: 'https://example.com/1.mp4', mediaType: 'MP4', createdAt: 100 },
    });
    client.emit('queue:add', {
      roomCode,
      item: { id: 'q2', title: 'Video 2', url: 'https://example.com/2.mp4', mediaType: 'MP4', createdAt: 200 },
    });
    await new Promise((r) => setTimeout(r, 100));

    // Upvote item 2 so it ranks higher
    const updatePromise = new Promise<any>((resolve) => {
      const handler = (data: any) => {
        if (data.queue && data.queue[0]?.id === 'q2') {
          client.off('queue:updated', handler);
          resolve(data);
        }
      };
      client.on('queue:updated', handler);
    });
    client.emit('queue:vote', { roomCode, itemId: 'q2', delta: 5 });
    const payload = await updatePromise;

    expect(payload.roomCode).toBe(roomCode);
    expect(payload.queue[0].id).toBe('q2');
    expect(payload.queue[0].votes).toBe(5);
  });

  it('should support fast in-memory chat history retrieval via CircularBuffer', async () => {
    const roomCode = 'CHAT_FAST';
    client.emit('room:join', {
      roomCode,
      user: { id: 'user_chat', name: 'Chatter', avatarColor: '#3b82f6' },
    });
    await new Promise((r) => setTimeout(r, 50));

    client.emit('chat:send', { roomCode, text: 'Instant message 1' });
    client.emit('chat:send', { roomCode, text: 'Instant message 2' });
    await new Promise((r) => setTimeout(r, 50));

    const history: any[] = await new Promise((resolve) => {
      client.emit('chat:history_fast', (msgs: any[]) => resolve(msgs));
    });

    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history.some((m) => m.text === 'Instant message 1')).toBe(true);
    expect(history.some((m) => m.text === 'Instant message 2')).toBe(true);
  });
});
