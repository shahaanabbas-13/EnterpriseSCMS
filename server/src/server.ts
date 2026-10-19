import http from 'http';
import app from './app';
import config from './config';
import { connectDB, disconnectDB } from './config/db';
import { connectRedis, disconnectRedis } from './config/redis';
import { initializeSocket } from './config/socket';
import { initializeQueues, shutdownQueues } from './jobs/queue';
import { initLowStockAlertWorker } from './jobs/lowStockAlert.job';
import { registerStockEventListeners } from './events/stockEvents';
import { logger } from './utils/logger';

/**
 * Server entry point.
 * Connects all services and starts listening.
 *
 * Boot sequence:
 * 1. Connect MongoDB
 * 2. Connect Redis
 * 3. Initialize BullMQ queues + workers
 * 4. Register event listeners
 * 5. Create HTTP server
 * 6. Initialize Socket.io
 * 7. Start listening
 */
const startServer = async (): Promise<void> => {
  try {
    // 1. Connect MongoDB
    logger.info('Connecting to MongoDB...');
    await connectDB();

    // 2. Connect Redis
    logger.info('Connecting to Redis...');
    connectRedis();

    // 3. Initialize background job queues + workers
    logger.info('Initializing job queues...');
    initializeQueues();
    initLowStockAlertWorker();

    // 4. Register domain event listeners
    logger.info('Registering event listeners...');
    registerStockEventListeners();

    // 5. Create HTTP server
    const httpServer = http.createServer(app);

    // 6. Initialize Socket.io on the HTTP server
    initializeSocket(httpServer);

    // 7. Start listening
    httpServer.listen(config.port, () => {
      logger.info('══════════════════════════════════════════════════════════════════════════════');
      logger.info(`  SCMS Server running on port ${config.port}`);
      logger.info(`  Environment: ${config.env}`);
      logger.info(`  Health: http://localhost:${config.port}/api/health`);
      logger.info('══════════════════════════════════════════════════════════════════════════════');
    });

    // ─── Graceful Shutdown ─────────────────────────────────────────────────────
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`${signal} received. Starting graceful shutdown...`);

      httpServer.close(async () => {
        logger.info('HTTP server closed.');
        await shutdownQueues();
        await disconnectRedis();
        await disconnectDB();
        logger.info('All connections closed. Goodbye!');
        process.exit(0);
      });

      setTimeout(() => {
        logger.error('Graceful shutdown timed out. Forcing exit.');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // ─── Unhandled Errors ──────────────────────────────────────────────────────
    process.on('unhandledRejection', (reason: unknown) => {
      logger.error('Unhandled Rejection:', reason);
    });

    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
