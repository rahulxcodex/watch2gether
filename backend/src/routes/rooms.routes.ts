import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { nanoid, customAlphabet } from 'nanoid';
import { RoomService } from '../services/room.service';
import { UserService } from '../services/user.service';
import type { PermissionMode, MediaType } from '@watch2gether/shared';

const createRoomSchema = z.object({
  name: z.string().min(1).max(100).default('Watch Room'),
  mediaUrl: z.string().default(''),
  mediaType: z.enum(['MP4', 'YOUTUBE', 'HLS']).default('MP4'),
  permissionMode: z.enum(['HOST_ONLY', 'SHARED']).default('HOST_ONLY'),
});

const generateRoomCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

export const roomRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/rooms - Create a room
  fastify.post('/', async (request, reply) => {
    const parseResult = createRoomSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'BadRequest',
        message: 'Invalid room creation payload',
        details: parseResult.error.flatten(),
      });
    }

    let userId: string;
    let userName: string;

    // Check if authenticated
    try {
      const authHeader = request.headers.authorization;
      let decoded: any;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        decoded = await request.jwtVerify();
      } else if (request.cookies.w2g_token) {
        decoded = await request.jwtVerify({ onlyCookie: true });
      } else {
        throw new Error('No token');
      }
      userId = decoded.id;
      userName = decoded.name;
    } catch {
      // Auto-provision guest user for frictionless room creation
      const code = generateRoomCode();
      const newGuest = await UserService.createUser({
        id: `usr_${nanoid(10)}`,
        name: `Host ${code}`,
        isGuest: true,
      });
      userId = newGuest.id;
      userName = newGuest.name;

      const token = fastify.jwt.sign(
        { id: userId, name: userName, isGuest: true },
        { expiresIn: '7d' }
      );
      reply.setCookie('w2g_token', token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 7 * 86400,
      });
    }

    const { name, mediaUrl, mediaType, permissionMode } = parseResult.data;
    const roomCode = generateRoomCode();
    const roomId = `room_${nanoid(12)}`;

    const room = await RoomService.createRoom({
      id: roomId,
      roomCode,
      name,
      hostId: userId,
      mediaUrl,
      mediaType: mediaType as MediaType,
      permissionMode: permissionMode as PermissionMode,
      playbackState: 'IDLE',
      currentTime: 0,
      version: 1,
    });

    return reply.status(201).send({
      id: room.id,
      roomCode: room.roomCode,
      name: room.name,
      hostId: room.hostId,
      mediaUrl: room.mediaUrl,
      mediaType: room.mediaType,
      playbackState: room.playbackState,
      currentTime: room.currentTime,
      permissionMode: room.permissionMode,
      version: room.version,
      createdAt: room.createdAt.toISOString(),
    });
  });

  // GET /api/rooms/:roomCode - Get room details
  fastify.get('/:roomCode', async (request, reply) => {
    const { roomCode } = request.params as { roomCode: string };

    if (!roomCode || roomCode.trim().length === 0) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'BadRequest',
        message: 'Invalid roomCode parameter',
      });
    }

    const room = await RoomService.getRoomByCode(roomCode.trim().toUpperCase());
    if (!room) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'NotFound',
        message: `Room not found with code: ${roomCode}`,
      });
    }

    return reply.status(200).send({
      id: room.id,
      roomCode: room.roomCode,
      name: room.name,
      hostId: room.hostId,
      mediaUrl: room.mediaUrl,
      mediaType: room.mediaType,
      playbackState: room.playbackState,
      currentTime: room.currentTime,
      permissionMode: room.permissionMode,
      version: room.version,
      createdAt: room.createdAt.toISOString(),
    });
  });
};
