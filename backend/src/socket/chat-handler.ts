import { Server, Socket } from 'socket.io';
import type { FastifyBaseLogger } from 'fastify';
import type { IRoomStateStore } from '../services/room.service';
import type { SocketData } from './io';
import { getDb } from '../db/db';
import { messages } from '../db/schema';
import { nanoid } from 'nanoid';

const REACTION_RATE_LIMIT_MS = 150; // max ~6 reactions per second per client

export function registerChatHandlers(
  io: Server,
  socket: Socket<any, any, any, SocketData>,
  roomStore: IRoomStateStore,
  logger: FastifyBaseLogger
) {
  let lastReactionTime = 0;

  // Real-time Chat
  socket.on(
    'chat:send',
    async (data: { roomCode?: string; text: string; clientTempId?: string }) => {
      const roomCode = (data.roomCode || socket.data.roomCode)?.toUpperCase();
      if (!roomCode || !socket.data.userId) return;

      const trimmed = (data.text || '').trim();
      if (!trimmed || trimmed.length > 500) return;

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
      };

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
