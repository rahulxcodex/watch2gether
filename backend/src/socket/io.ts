import { Server as SocketIOServer, Socket } from 'socket.io';
import type { FastifyInstance } from 'fastify';
import { RedisService } from '../services/redis.service';
import { MemoryRoomStateStore, IRoomStateStore } from '../services/room.service';
import { registerRoomHandlers } from './room-handler';
import { registerSyncHandlers } from './sync-handler';
import { registerChatHandlers } from './chat-handler';

export interface SocketData {
  userId?: string;
  userName?: string;
  avatarColor?: string;
  roomCode?: string;
  isHost?: boolean;
  isGuest?: boolean;
  isAuthenticated?: boolean;
}

export function initSocketIO(
  fastify: FastifyInstance,
  roomStore: IRoomStateStore = new MemoryRoomStateStore(),
  redisService?: RedisService
): SocketIOServer {
  const io = new SocketIOServer(fastify.server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  if (redisService) {
    redisService.setupAdapter(io).catch((err) => {
      fastify.log.warn({ err }, 'Error setting up Redis adapter for Socket.io');
    });
  }

  io.on('connection', (socket: Socket<any, any, any, SocketData>) => {
    fastify.log.debug({ socketId: socket.id }, 'Socket connected');

    registerRoomHandlers(io, socket, roomStore, fastify.log);
    registerSyncHandlers(io, socket, roomStore, fastify.log);
    registerChatHandlers(io, socket, roomStore, fastify.log);

    // WebRTC Signaling Relay
    socket.on('signal:offer', (payload: any) => {
      const roomCode = socket.data.roomCode || payload?.roomCode;
      if (!roomCode) return;
      socket.to(roomCode).emit('signal:offer', {
        ...payload,
        fromUserId: socket.data.userId,
      });
    });

    socket.on('signal:answer', (payload: any) => {
      const roomCode = socket.data.roomCode || payload?.roomCode;
      if (!roomCode) return;
      socket.to(roomCode).emit('signal:answer', {
        ...payload,
        fromUserId: socket.data.userId,
      });
    });

    socket.on('signal:ice', (payload: any) => {
      const roomCode = socket.data.roomCode || payload?.roomCode;
      if (!roomCode) return;
      socket.to(roomCode).emit('signal:ice', {
        ...payload,
        fromUserId: socket.data.userId,
      });
    });

    socket.on('voice:speaking', (payload: { isSpeaking: boolean }) => {
      const roomCode = socket.data.roomCode;
      if (!roomCode) return;
      socket.to(roomCode).emit('voice:speaking', {
        userId: socket.data.userId,
        isSpeaking: payload.isSpeaking,
      });
    });

    // Room Queue / Shelf
    socket.on('queue:add', async (payload: { item: any }) => {
      const roomCode = socket.data.roomCode;
      if (!roomCode || !payload?.item) return;
      const state = await roomStore.addToQueue(roomCode, {
        ...payload.item,
        addedBy: socket.data.userId,
        addedByName: socket.data.userName,
        createdAt: Date.now(),
      });
      if (state) {
        io.to(roomCode).emit('queue:updated', { queue: state.queue });
      }
    });

    socket.on('queue:remove', async (payload: { itemId: string }) => {
      const roomCode = socket.data.roomCode;
      if (!roomCode || !payload?.itemId) return;
      const state = await roomStore.removeFromQueue(roomCode, payload.itemId);
      if (state) {
        io.to(roomCode).emit('queue:updated', { queue: state.queue });
      }
    });

    // Dual Playhead Scrubber progress reporting
    socket.on('media:progress_report', (payload: { currentTime: number; duration?: number; isStalled?: boolean }) => {
      const roomCode = socket.data.roomCode;
      if (!roomCode) return;
      socket.to(roomCode).emit('media:progress_update', {
        userId: socket.data.userId,
        name: socket.data.userName,
        color: socket.data.avatarColor,
        currentTime: payload.currentTime,
        duration: payload.duration,
        isStalled: payload.isStalled,
        updatedAt: Date.now(),
      });
    });

    socket.on('disconnect', async () => {
      fastify.log.debug({ socketId: socket.id }, 'Socket disconnected');
      const roomCode = socket.data.roomCode;
      if (roomCode) {
        const { state, removedMember, newHostId } = await roomStore.removeMember(
          roomCode,
          socket.id
        );
        if (removedMember) {
          io.to(roomCode).emit('room:member_left', {
            userId: removedMember.id,
            userName: removedMember.name,
            participantCount: state ? state.members.size : 0,
            newHostId: newHostId || undefined,
            timestamp: Date.now(),
          });
        }
      }
    });
  });

  return io;
}
