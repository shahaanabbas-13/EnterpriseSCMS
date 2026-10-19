import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { ApiResponse } from '../utils/ApiResponse';
import { logger } from '../utils/logger';

/**
 * Health check controller.
 * Returns system status including database and redis connectivity.
 * Used by load balancers, monitoring tools, and DevOps dashboards.
 */
export class HealthController {
  /**
   * GET /api/health
   * Returns overall system health status.
   */
  static async check(_req: Request, res: Response): Promise<void> {
    const mongoStatus = mongoose.connection.readyState;
    const mongoStates: Record<number, string> = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };

    let redisStatus = 'disconnected';
    try {
      // Try to get redis client — will throw if not initialized
      const { getRedisClient } = require('../config/redis');
      const redis = getRedisClient();
      await redis.ping();
      redisStatus = 'connected';
    } catch {
      redisStatus = 'disconnected';
    }

    const healthData = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      services: {
        mongodb: mongoStates[mongoStatus] || 'unknown',
        redis: redisStatus,
      },
      memory: {
        used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
      },
    };

    logger.debug('Health check performed', healthData);

    ApiResponse.success(res, healthData, 'System healthy');
  }

  /**
   * GET /api/health/ready
   * Readiness probe — returns 200 only if all services are connected.
   */
  static async ready(_req: Request, res: Response): Promise<void> {
    const isMongoReady = mongoose.connection.readyState === 1;

    let isRedisReady = false;
    try {
      const { getRedisClient } = require('../config/redis');
      const redis = getRedisClient();
      const pong = await redis.ping();
      isRedisReady = pong === 'PONG';
    } catch {
      isRedisReady = false;
    }

    if (isMongoReady && isRedisReady) {
      ApiResponse.success(res, { ready: true }, 'All systems ready');
    } else {
      ApiResponse.error(
        res,
        'System not ready',
        503,
        [
          !isMongoReady && 'MongoDB not connected',
          !isRedisReady && 'Redis not connected',
        ].filter(Boolean)
      );
    }
  }
}
