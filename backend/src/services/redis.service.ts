import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server as SocketIOServer } from 'socket.io';
import type { FastifyBaseLogger } from 'fastify';

export interface RedisServiceConfig {
  redisUrl?: string;
  connectTimeoutMs?: number;
  logger?: FastifyBaseLogger;
}

export class RedisService {
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;
  private isConnected = false;
  private mode: 'redis' | 'memory' = 'memory';

  constructor(private config?: RedisServiceConfig) {}

  public async setupAdapter(
    io: SocketIOServer
  ): Promise<{ mode: 'redis' | 'memory'; isConnected: boolean }> {
    let redisUrl = this.config?.redisUrl || process.env.REDIS_URL;

    if (!redisUrl) {
      if (this.config?.logger) {
        this.config.logger.info(
          '[RedisService] No REDIS_URL configured. Using standalone In-Memory adapter.'
        );
      }
      this.mode = 'memory';
      this.isConnected = false;
      return { mode: this.mode, isConnected: this.isConnected };
    }

    // Sanitize in case user copied the CLI command or needs rediss:// for Upstash
    redisUrl = redisUrl.trim();
    if (redisUrl.startsWith('redis-cli')) {
      const match = redisUrl.match(/redis:\/\/[^\s]+/);
      if (match) {
        redisUrl = match[0];
      }
    }
    if (redisUrl.includes('upstash.io') && redisUrl.startsWith('redis://')) {
      redisUrl = redisUrl.replace('redis://', 'rediss://');
    }

    try {
      if (this.config?.logger) {
        this.config.logger.info(`[RedisService] Connecting to Redis at ${redisUrl.replace(/:[^:@]+@/, ':***@')}...`);
      }

      const pub = new Redis(redisUrl, {
        connectTimeout: this.config?.connectTimeoutMs || 2000,
        maxRetriesPerRequest: null,
        enableOfflineQueue: false,
        retryStrategy: (times) => {
          if (times > 2) return null;
          return Math.min(times * 100, 500);
        },
      });

      const sub = pub.duplicate();

      await Promise.all([pub.connect(), sub.connect()]);

      this.pubClient = pub;
      this.subClient = sub;
      this.isConnected = true;
      this.mode = 'redis';

      io.adapter(createAdapter(this.pubClient, this.subClient));
      if (this.config?.logger) {
        this.config.logger.info('[RedisService] Successfully attached @socket.io/redis-adapter.');
      }

      pub.on('error', (err) => {
        if (this.config?.logger) {
          this.config.logger.warn({ err }, '[RedisService] Pub client error.');
        }
      });
      sub.on('error', (err) => {
        if (this.config?.logger) {
          this.config.logger.warn({ err }, '[RedisService] Sub client error.');
        }
      });

      return { mode: 'redis', isConnected: true };
    } catch (error) {
      if (this.config?.logger) {
        this.config.logger.warn(
          { error },
          '[RedisService] Failed to connect to Redis. Gracefully falling back to In-Memory adapter.'
        );
      }
      this.mode = 'memory';
      this.isConnected = false;
      if (this.pubClient) {
        try {
          this.pubClient.disconnect();
        } catch {}
        this.pubClient = null;
      }
      if (this.subClient) {
        try {
          this.subClient.disconnect();
        } catch {}
        this.subClient = null;
      }
      return { mode: 'memory', isConnected: false };
    }
  }

  public getStatus(): { mode: 'redis' | 'memory'; isConnected: boolean } {
    return {
      mode: this.mode,
      isConnected: this.isConnected,
    };
  }

  public async close(): Promise<void> {
    if (this.pubClient) {
      try {
        await this.pubClient.quit();
      } catch {}
    }
    if (this.subClient) {
      try {
        await this.subClient.quit();
      } catch {}
    }
    this.isConnected = false;
  }
}
