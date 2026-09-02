import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { buildApp } from '../src/app';
import { closeDatabase } from '../src/db/db';

describe('Real-Time Chat & Emoji Reactions', () => {
  let app: FastifyInstance;
  let port: number;
  let clientA: ClientSocket;
  let clientB: ClientSocket;

  beforeAll(async () => {
    app = await buildApp({ dbPath: ':memory:', logger: false });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    port = typeof address === 'object' && address ? address.port : 4000;

    clientA = Client(`http://127.0.0.1:${port}`, { transports: ['websocket'], forceNew: true });
    clientB = Client(`http://127.0.0.1:${port}`, { transports: ['websocket'], forceNew: true });

    await Promise.all([
      new Promise<void>((r) => clientA.on('connect', () => r())),
      new Promise<void>((r) => clientB.on('connect', () => r())),
    ]);

    // Both join ROOM_CHAT
    clientA.emit('room:join', {
      roomCode: 'CHAT99',
      user: { id: 'user_a', name: 'Alice', avatarColor: '#ef4444' },
    });
    clientB.emit('room:join', {
      roomCode: 'CHAT99',
      user: { id: 'user_b', name: 'Bob', avatarColor: '#3b82f6' },
    });

    await new Promise((r) => setTimeout(r, 100));
  });

  afterAll(async () => {
    if (clientA.connected) clientA.disconnect();
    if (clientB.connected) clientB.disconnect();
    await app.close();
    closeDatabase();
  });

  it('should deliver chat messages from Client A to Client B instantly', async () => {
    const messagePromise = new Promise<any>((resolve) => clientB.on('chat:message', resolve));

    clientA.emit('chat:send', {
      roomCode: 'CHAT99',
      text: 'Hey Bob, movie is starting!',
    });

    const msg = await messagePromise;
    expect(msg.text).toBe('Hey Bob, movie is starting!');
    expect(msg.sender.id).toBe('user_a');
    expect(msg.sender.name).toBe('Alice');
    expect(msg.sender.avatarColor).toBe('#ef4444');
    expect(msg.timestamp).toBeGreaterThan(0);
  });

  it('should deliver emoji reaction burst from Client B to Client A', async () => {
    const reactionPromise = new Promise<any>((resolve) => clientA.on('reaction:burst', resolve));

    clientB.emit('reaction:send', {
      roomCode: 'CHAT99',
      emoji: '🔥',
      x: 0.75,
    });

    const burst = await reactionPromise;
    expect(burst.emoji).toBe('🔥');
    expect(burst.senderId).toBe('user_b');
    expect(burst.senderName).toBe('Bob');
    expect(burst.x).toBe(0.75);
  });

  it('should reject empty or whitespace-only chat messages', async () => {
    let received = false;
    const listener = () => { received = true; };
    clientB.on('chat:message', listener);

    clientA.emit('chat:send', { roomCode: 'CHAT99', text: '   ' });
    await new Promise((r) => setTimeout(r, 100));

    expect(received).toBe(false);
    clientB.off('chat:message', listener);
  });
});
