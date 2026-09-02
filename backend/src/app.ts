import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import authPlugin from './plugins/auth.plugin';
import { authRoutes } from './routes/auth.routes';
import { roomRoutes } from './routes/rooms.routes';
import { healthRoutes } from './routes/health.routes';
import { proxyRoutes } from './routes/proxy.routes';
import { config } from './config';
import { getDb, initDatabase } from './db/db';
import { initSocketIO } from './socket/io';
import { RedisService } from './services/redis.service';
import { MemoryRoomStateStore, IRoomStateStore } from './services/room.service';
import type { Server as SocketIOServer } from 'socket.io';

declare module 'fastify' {
  interface FastifyInstance {
    io: SocketIOServer;
    roomStore: IRoomStateStore;
    redisService: RedisService;
  }
}

export interface BuildAppOptions {
  dbPath?: string;
  roomStore?: IRoomStateStore;
  redisService?: RedisService;
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const isTest = config.NODE_ENV === 'test';
  const app = Fastify({
    logger: options.logger ?? !isTest,
  });

  // Ensure DB initialized
  if (options.dbPath) {
    initDatabase(options.dbPath);
  } else {
    getDb();
  }

  // CORS Setup
  const origins = config.CORS_ORIGIN.split(',').map((s) => s.trim());
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || origins.includes(origin) || origin.startsWith('http://localhost:')) {
        cb(null, true);
        return;
      }
      cb(null, true); // Allow during dev/test
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Plugins
  await app.register(authPlugin);

  const redisService = options.redisService || new RedisService({ logger: app.log });
  const roomStore = options.roomStore || new MemoryRoomStateStore();

  // Health check
  await app.register(healthRoutes, { redisService });

  // API Routes
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(roomRoutes, { prefix: '/api/rooms' });
  await app.register(proxyRoutes);

  // Initialize Socket.io
  const io = initSocketIO(app, roomStore, redisService);

  app.decorate('io', io);
  app.decorate('roomStore', roomStore);
  app.decorate('redisService', redisService);

  // Global Error Handler
  app.setErrorHandler((error, request, reply) => {
    app.log.error(error);
    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      statusCode,
      error: error.name || 'InternalServerError',
      message: error.message || 'An unexpected error occurred',
    });
  });

  return app;
}
