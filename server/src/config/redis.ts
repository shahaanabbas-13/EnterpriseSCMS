import Redis from 'ioredis';
import config from './index';
import { logger } from '../utils/logger';

let redisClient: Redis | null = null;

export const connectRedis = (): Redis => {
  if (redisClient) return redisClient;

  redisClient = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    maxRetriesPerRequest: null, // Required by BullMQ
    retryStrategy: (times: number) => {
      if (times > 10) {
        logger.error('Redis max retries reached. Stopping reconnection.');
        return null; // Stop retrying
      }
      const delay = Math.min(times * 200, 5000);
      logger.warn(`Redis retry attempt ${times}, next in ${delay}ms`);
      return delay;
    },
  });

  redisClient.on('connect', () => {
    logger.info('Redis connected');
  });

  redisClient.on('error', (err) => {
    logger.error('Redis error:', err.message);
  });

  redisClient.on('close', () => {
    logger.warn('Redis connection closed');
  });

  return redisClient;
};

export const getRedisClient = (): Redis => {
  if (!redisClient) {
    throw new Error('Redis not initialized. Call connectRedis() first.');
  }
  return redisClient;
};

export const disconnectRedis = async (): Promise<void> => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis disconnected gracefully.');
  }
};
