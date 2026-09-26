import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getDb } from '../db/db';
import { rooms, messages, users, telemetryEvents } from '../db/schema';
import {
  computePeakConcurrency,
  CollaborativeRecommender,
  kmeans,
} from '@watch2gether/shared';

// Pre-seeded recommender cache
const recommender = new CollaborativeRecommender();

export const analyticsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /**
   * Peak Concurrency via Sweep-Line Algorithm (Tier 3.4)
   */
  fastify.get('/api/analytics/concurrency', async (_request, reply) => {
    try {
      const db = getDb();
      const allRooms = db.select().from(rooms).all();

      const intervals = allRooms.map((r, i) => ({
        userId: r.hostId || `user_${i}`,
        startTime: r.createdAt.getTime(),
        endTime: r.updatedAt.getTime() + 1000,
      }));

      const peakStats = computePeakConcurrency(intervals);
      return reply.send({
        success: true,
        data: peakStats,
      });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  /**
   * Descriptive Statistics Dashboard Metrics (Tier 4.1)
   */
  fastify.get('/api/analytics/stats', async (_request, reply) => {
    try {
      const db = getDb();
      const allRooms = db.select().from(rooms).all();
      const allUsers = db.select().from(users).all();
      const allMessages = db.select().from(messages).all();

      const totalRooms = allRooms.length;
      const totalUsers = allUsers.length;
      const totalMessages = allMessages.length;

      // Calculate room durations
      const durations = allRooms.map((r) => Math.max(0, (r.updatedAt.getTime() - r.createdAt.getTime()) / 1000));
      const avgDurationSec = durations.length > 0
        ? Number((durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1))
        : 0;

      return reply.send({
        success: true,
        data: {
          totalRooms,
          totalUsers,
          totalMessages,
          avgDurationSec,
          activeRoomsCount: allRooms.filter((r) => r.playbackState === 'PLAYING').length,
        },
      });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  /**
   * Collaborative Filtering Recommendations (Tier 6.2)
   */
  fastify.get('/api/recommendations', async (request, reply) => {
    try {
      const { mediaUrl, limit } = request.query as { mediaUrl?: string; limit?: string };
      const maxResults = limit ? parseInt(limit, 10) : 5;

      // Seed from DB if cache empty
      const db = getDb();
      const recentRooms = db.select().from(rooms).all();
      for (const r of recentRooms) {
        if (r.mediaUrl) {
          recommender.recordInteraction(r.hostId, r.mediaUrl);
        }
      }

      if (!mediaUrl) {
        // Return popular items if no target specified
        const popular = recentRooms
          .filter((r) => !!r.mediaUrl)
          .slice(0, maxResults)
          .map((r) => ({ mediaUrl: r.mediaUrl, title: r.name }));
        return reply.send({ success: true, data: popular });
      }

      const recs = recommender.getRecommendationsForMedia(mediaUrl, maxResults);
      return reply.send({ success: true, data: recs });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  /**
   * K-Means User Segmentation (Tier 5.3)
   */
  fastify.get('/api/analytics/segments', async (_request, reply) => {
    try {
      const db = getDb();
      const allUsers = db.select().from(users).all();
      const allRooms = db.select().from(rooms).all();

      // Feature vectors: [roomsCreated, isGuest ? 1 : 0]
      const userVectors = allUsers.map((u) => {
        const roomsCreated = allRooms.filter((r) => r.hostId === u.id).length;
        return [roomsCreated, u.isGuest ? 1 : 0];
      });

      if (userVectors.length < 2) {
        return reply.send({ success: true, data: { clusters: 1, message: 'Insufficient users for clustering' } });
      }

      const clusters = kmeans(userVectors, Math.min(3, userVectors.length));
      return reply.send({ success: true, data: clusters });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });
};
