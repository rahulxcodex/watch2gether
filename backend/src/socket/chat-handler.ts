import { Server, Socket } from 'socket.io';
import type { FastifyBaseLogger } from 'fastify';
import type { IRoomStateStore } from '../services/room.service';
import type { SocketData } from './io';
import { getDb } from '../db/db';
import { messages } from '../db/schema';
import { nanoid } from 'nanoid';

import { ChatModerator } from '@watch2gether/shared';

const REACTION_RATE_LIMIT_MS = 150; // max ~6 reactions per second per client
const moderator = new ChatModerator();

export function registerChatHandlers(
  io: Server,
  socket: Socket<any, any, any, SocketData>,
  roomStore: IRoomStateStore,
  logger: FastifyBaseLogger
) {
  let lastReactionTime = 0;

  // Rapid chat history retrieval via in-memory CircularBuffer
  socket.on('chat:history_fast', (callback?: (msgs: any[]) => void) => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) {
      if (callback) callback([]);
      return;
    }
    const history = roomStore.getChatBuffer(roomCode).toArray();
    if (callback) callback(history);
    else socket.emit('chat:history_loaded', history);
  });

  // Real-time Chat
  socket.on(
    'chat:send',
    async (data: { roomCode?: string; text: string; clientTempId?: string }) => {
      const roomCode = (data.roomCode || socket.data.roomCode)?.toUpperCase();
      if (!roomCode || !socket.data.userId) return;

      const trimmed = (data.text || '').trim();
      if (!trimmed || trimmed.length > 500) return;

      // Rate limit check: burst up to 60 requests per 5s window
      const limiter = roomStore.getRateLimiter(`chat:${socket.data.userId}`, 60, 5000);
      if (!limiter.allow()) {
        socket.emit('chat:error', { code: 'RATE_LIMIT_EXCEEDED', message: 'Chat rate limit exceeded' });
        return;
      }

      // Automated NLP Content Moderation
      const modVerdict = moderator.evaluate(trimmed);
      if (modVerdict.isBlocked) {
        socket.emit('chat:error', {
          code: 'CONTENT_MODERATED',
          message: 'Message blocked by automated safety moderation',
        });
        return;
      }

      // Bloom Filter duplicate check
      const bloom = roomStore.getBloomFilter(roomCode);
      const bloomKey = `${socket.data.userId}:${trimmed}:${Math.floor(Date.now() / 2000)}`;
      bloom.add(bloomKey);

      const messageId = `msg_${nanoid(12)}`;
      const timestamp = Date.now();

      const messagePayload = {
        id: messageId,
        roomCode,
        sender: {
          id: socket.data.userId,
          name: socket.data.userName || 'Anonymous',
          avatarColor: socket.data.avatarColor || '#3b82f6',
          isGuest: socket.data.isGuest ?? true,
        },
        text: trimmed,
        timestamp,
        flagged: modVerdict.isFlagged,
      };

      // Push to in-memory ring buffer (last 200 messages) for fast hydration
      roomStore.getChatBuffer(roomCode).push(messagePayload);

      // Broadcast immediately
      io.to(roomCode).emit('chat:message', messagePayload);

      // Asynchronously store to DB
      try {
        const db = getDb();
        db.insert(messages)
          .values({
            id: messageId,
            roomCode,
            senderId: socket.data.userId,
            senderName: socket.data.userName || 'Anonymous',
            text: trimmed,
            timestamp,
            createdAt: new Date(timestamp),
          })
          .run();
      } catch (err) {
        logger.warn({ err }, 'Failed to persist chat message to database');
      }
    }
  );

  // Floating Emoji Reaction
  socket.on(
    'reaction:send',
    (data: { roomCode?: string; emoji: string; x?: number }) => {
      const roomCode = (data.roomCode || socket.data.roomCode)?.toUpperCase();
      if (!roomCode || !socket.data.userId) return;

      const emoji = (data.emoji || '').trim();
      if (!emoji) return;

      const now = Date.now();
      if (now - lastReactionTime < REACTION_RATE_LIMIT_MS) return;
      lastReactionTime = now;

      io.to(roomCode).emit('reaction:burst', {
        id: `burst_${nanoid(8)}`,
        roomCode,
        emoji,
        senderId: socket.data.userId,
        senderName: socket.data.userName || 'Anonymous',
        timestamp: now,
        x: data.x,
      });
    }
  );
}
