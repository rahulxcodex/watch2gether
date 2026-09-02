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
