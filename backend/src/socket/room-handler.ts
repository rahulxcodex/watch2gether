import { Server, Socket } from 'socket.io';
import type { FastifyBaseLogger } from 'fastify';
import { IRoomStateStore, projectCurrentTime } from '../services/room.service';
import type { SocketData } from './io';
import type { PermissionMode } from '@watch2gether/shared';

export function registerRoomHandlers(
  io: Server,
  socket: Socket<any, any, any, SocketData>,
  roomStore: IRoomStateStore,
  logger: FastifyBaseLogger
) {
  // Join Room
  socket.on(
    'room:join',
    async (
      data: {
        roomCode: string;
        user: { id?: string; name: string; avatarColor?: string; isGuest?: boolean };
        token?: string;
        sessionToken?: string;
      },
      callback?: (response: { success: boolean; data?: any; error?: string }) => void
    ) => {
      try {
        const rawCode = data.roomCode;
        if (!rawCode) {
          if (callback) callback({ success: false, error: 'Missing roomCode' });
          return;
        }
        const roomCode = rawCode.toUpperCase();

        const userId = data.user?.id || `usr_${Date.now()}`;
        const userName = data.user?.name || 'Anonymous';
        const avatarColor = data.user?.avatarColor || '#3b82f6';

        let room = await roomStore.getRoom(roomCode);

        if (!room) {
          room = await roomStore.createRoom({
            id: `room_${Date.now()}`,
            roomCode,
            name: `Room ${roomCode}`,
            hostId: userId,
            permissionMode: 'HOST_ONLY',
            mediaUrl: '',
            mediaType: 'MP4',
            playbackState: 'IDLE',
            currentTime: 0,
            playbackRate: 1.0,
            updatedAt: Date.now(),
            version: 1,
            createdAt: Date.now(),
          });
        }

        socket.data.userId = userId;
        socket.data.userName = userName;
        socket.data.avatarColor = avatarColor;
        socket.data.roomCode = roomCode;
        socket.data.isGuest = data.user?.isGuest ?? true;

        await socket.join(roomCode);

        const { state: updatedRoom, member } = await roomStore.addMember(roomCode, {
          id: userId,
          name: userName,
          avatarColor,
          socketId: socket.id,
          isHost: room.hostId === userId || room.members.size === 0,
          joinedAt: Date.now(),
        });

        socket.data.isHost = member.isHost;

        const now = Date.now();
        const projectedTime = projectCurrentTime(updatedRoom, now);

        const payload = {
          room: {
            id: updatedRoom.id,
            roomCode: updatedRoom.roomCode,
            name: updatedRoom.name,
            hostId: updatedRoom.hostId,
            permissionMode: updatedRoom.permissionMode,
            mediaUrl: updatedRoom.mediaUrl,
            mediaType: updatedRoom.mediaType,
          },
          user: {
            id: member.id,
            name: member.name,
            avatarColor: member.avatarColor,
            isHost: member.isHost,
          },
          users: Array.from(updatedRoom.members.values()).map((m) => ({
            id: m.id,
            name: m.name,
            avatarColor: m.avatarColor,
            isHost: m.isHost,
          })),
          playbackState: {
            state: updatedRoom.playbackState,
            status: updatedRoom.playbackState,
            currentTime: projectedTime,
            playbackRate: updatedRoom.playbackRate,
            serverTimestamp: now,
            version: updatedRoom.version,
            mediaUrl: updatedRoom.mediaUrl,
            mediaType: updatedRoom.mediaType,
          },
          serverTimestamp: now,
        };

        socket.emit('room:joined', payload);

        socket.to(roomCode).emit('room:member_joined', {
          user: {
            id: member.id,
            name: member.name,
            avatarColor: member.avatarColor,
            isHost: member.isHost,
          },
          participantCount: updatedRoom.members.size,
          timestamp: now,
        });

        if (callback) {
          callback({ success: true, data: payload });
        }
      } catch (err: any) {
        logger.error({ err }, 'Error in room:join handler');
        if (callback) {
          callback({ success: false, error: err.message || 'Failed to join room' });
        }
      }
    }
  );

  // Leave Room
  socket.on('room:leave', async (data: { roomCode?: string }) => {
    const rawCode = data?.roomCode || socket.data.roomCode;
    if (!rawCode) return;
    const roomCode = rawCode.toUpperCase();

    await socket.leave(roomCode);
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
  });

  // Set Permission Mode (Host Only)
  socket.on(
    'room:set_permission',
    async (data: { roomCode?: string; permissionMode: PermissionMode }) => {
      const rawCode = data?.roomCode || socket.data.roomCode;
      if (!rawCode) return;
      const roomCode = rawCode.toUpperCase();

      const room = await roomStore.getRoom(roomCode);
      if (!room) return;

      if (room.hostId !== socket.data.userId) {
        socket.emit('permission:denied', {
          code: 'PERMISSION_DENIED',
          message: 'Only the room host can change permissions',
          action: 'room:set_permission',
        });
        return;
      }

      const updated = await roomStore.setPermissionMode(roomCode, data.permissionMode);
      if (updated) {
        io.to(roomCode).emit('room:permission_updated', {
          roomCode: updated.roomCode,
          permissionMode: updated.permissionMode,
          updatedBy: socket.data.userId || socket.id,
          timestamp: Date.now(),
        });
      }
    }
  );
}