import { FastifyPluginAsync } from 'fastify';
import { getDb } from '../db/db';
import { sql } from 'drizzle-orm';
import type { RedisService } from '../services/redis.service';

export const healthRoutes: FastifyPluginAsync<{ redisService?: RedisService }> = async (
  fastify,
  opts
) => {
  fastify.get('/health', async (_request, reply) => {
    let dbHealthy = false;
    try {
      const db = getDb();
      db.run(sql`SELECT 1`);
      dbHealthy = true;
    } catch {
      dbHealthy = false;
    }

    const redisStatus = opts.redisService ? opts.redisService.getStatus() : { mode: 'memory', isConnected: true };
    const redisHealthy = redisStatus.mode === 'memory' || redisStatus.isConnected;

    const response = {
      status: dbHealthy ? 'ok' : 'degraded',
      timestamp: Date.now(),
      uptime: process.uptime(),
      database: dbHealthy,
      db: dbHealthy,
      redis: redisHealthy,
      mode: redisStatus.mode,
    };

    return reply.status(dbHealthy ? 200 : 503).send(response);
  });
};
