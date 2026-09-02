import { Server, Socket } from 'socket.io';
import type { FastifyBaseLogger } from 'fastify';
import { IRoomStateStore } from '../services/room.service';
import type { SocketData } from './io';
import type { MediaType } from '@watch2gether/shared';

export function registerSyncHandlers(
  io: Server,
  socket: Socket<any, any, any, SocketData>,
  roomStore: IRoomStateStore,
  logger: FastifyBaseLogger
) {
  // 1. High-Precision NTP Clock Sync
  socket.on(
    'sync:ping',
    (data: { clientTimestamp: number; clientSequence?: number }) => {
      socket.emit('sync:pong', {
        clientTimestamp: data.clientTimestamp,
        serverTimestamp: Date.now(),
        clientSequence: data.clientSequence,
      });
    }
  );

  // Helper: Validate playback permissions
  const canControlMedia = (room: any, userId?: string): boolean => {
    if (!userId) return false;
    if (room.permissionMode === 'SHARED') return true;
    return room.hostId === userId;
  };

  // 2. Media Play
  socket.on(
    'media:play',
    async (data: {
      roomCode?: string;
      currentTime: number;
      clientTimestamp?: number;
      playbackRate?: number;
    }) => {
      const roomCode = (data.roomCode || socket.data.roomCode)?.toUpperCase();
      if (!roomCode) return;

      const room = await roomStore.getRoom(roomCode);
      if (!room) return;

      if (!canControlMedia(room, socket.data.userId)) {
        socket.emit('permission:denied', {
          code: 'PERMISSION_DENIED',
          message: 'Playback controls restricted to host in HOST_ONLY mode',
          action: 'media:play',
        });
        return;
      }

      const updated = await roomStore.updatePlayback(roomCode, {
        playbackState: 'PLAYING',
        currentTime: data.currentTime,
        playbackRate: data.playbackRate || 1.0,
      });

      if (updated) {
        io.to(roomCode).emit('media:sync', {
          state: 'PLAYING',
          status: 'PLAYING',
          currentTime: updated.currentTime,
          playbackRate: updated.playbackRate,
          serverTimestamp: updated.updatedAt,
          version: updated.version,
          issuerId: socket.data.userId || socket.id,
          mediaUrl: updated.mediaUrl,
          mediaType: updated.mediaType,
        });
      }
    }
  );

  // 3. Media Pause (<= 200ms target propagation)
  socket.on(
    'media:pause',
    async (data: {
      roomCode?: string;
      currentTime: number;
      clientTimestamp?: number;
    }) => {
      const roomCode = (data.roomCode || socket.data.roomCode)?.toUpperCase();
      if (!roomCode) return;

      const room = await roomStore.getRoom(roomCode);
      if (!room) return;

      if (!canControlMedia(room, socket.data.userId)) {
        socket.emit('permission:denied', {
          code: 'PERMISSION_DENIED',
          message: 'Playback controls restricted to host in HOST_ONLY mode',
          action: 'media:pause',
        });
        return;
      }

      const updated = await roomStore.updatePlayback(roomCode, {
        playbackState: 'PAUSED',
        currentTime: data.currentTime,
      });

      if (updated) {
        io.to(roomCode).emit('media:sync', {
          state: 'PAUSED',
          status: 'PAUSED',
          currentTime: updated.currentTime,
          playbackRate: updated.playbackRate,
          serverTimestamp: updated.updatedAt,
          version: updated.version,
          issuerId: socket.data.userId || socket.id,
          mediaUrl: updated.mediaUrl,
          mediaType: updated.mediaType,
        });
      }
    }
  );

  // 4. Media Seek
  socket.on(
    'media:seek',
    async (data: {
      roomCode?: string;
      targetTime: number;
      clientTimestamp?: number;
      autoPlay?: boolean;
    }) => {
      const roomCode = (data.roomCode || socket.data.roomCode)?.toUpperCase();
      if (!roomCode) return;

      const room = await roomStore.getRoom(roomCode);
      if (!room) return;

      if (!canControlMedia(room, socket.data.userId)) {
        socket.emit('permission:denied', {
          code: 'PERMISSION_DENIED',
          message: 'Playback controls restricted to host in HOST_ONLY mode',
          action: 'media:seek',
        });
        return;
      }

      const targetTime = Math.max(0, data.targetTime);
      const updated = await roomStore.updatePlayback(roomCode, {
        currentTime: targetTime,
        playbackState: data.autoPlay ? 'PLAYING' : room.playbackState,
      });

      if (updated) {
        io.to(roomCode).emit('media:sync', {
          state: updated.playbackState,
          status: updated.playbackState,
          currentTime: updated.currentTime,
          playbackRate: updated.playbackRate,
          serverTimestamp: updated.updatedAt,
          version: updated.version,
          issuerId: socket.data.userId || socket.id,
          mediaUrl: updated.mediaUrl,
          mediaType: updated.mediaType,
        });
      }
    }
  );

  // 5. Media Change (supports both media:change and room:change_media)
  const handleMediaChange = async (data: {
    roomCode?: string;
    mediaUrl: string;
    mediaType?: MediaType;
  }) => {
      const roomCode = (data.roomCode || socket.data.roomCode)?.toUpperCase();
      if (!roomCode) return;

      const room = await roomStore.getRoom(roomCode);
      if (!room) return;

      if (!canControlMedia(room, socket.data.userId)) {
        socket.emit('permission:denied', {
          code: 'PERMISSION_DENIED',
          message: 'Changing media restricted to host in HOST_ONLY mode',
          action: 'media:change',
        });
        return;
      }

      const mediaType = data.mediaType || (data.mediaUrl.includes('youtube') || data.mediaUrl.includes('youtu.be') ? 'YOUTUBE' : 'MP4');

      const updated = await roomStore.updatePlayback(roomCode, {
        mediaUrl: data.mediaUrl,
        mediaType,
        currentTime: 0,
        playbackState: 'PAUSED',
      });

      if (updated) {
        const syncPayload = {
          state: 'PAUSED' as const,
          status: 'PAUSED' as const,
          currentTime: 0,
          playbackRate: 1.0,
          serverTimestamp: updated.updatedAt,
          version: updated.version,
          issuerId: socket.data.userId || socket.id,
          mediaUrl: updated.mediaUrl,
          mediaType: updated.mediaType,
        };

        io.to(roomCode).emit('media:sync', syncPayload);
        io.to(roomCode).emit('room:media_changed', {
          roomCode: updated.roomCode,
          mediaUrl: updated.mediaUrl,
          mediaType: updated.mediaType,
          playbackState: syncPayload,
          updatedBy: socket.data.userId || socket.id,
        });
      }
    };

  socket.on('media:change', handleMediaChange);
  socket.on('room:change_media', handleMediaChange);
}
