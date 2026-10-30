import app from './app';
import config from './config';
import { logger } from './utils/logger';

/**
 * HTTP entry point for the Vercel container service.
 * The regular server entry point also starts Redis workers and Socket.IO,
 * which are separate long-running services and aren't needed by this API.
 */
const server = app.listen(config.port, '0.0.0.0', () => {
  logger.info(`SCMS API container listening on port ${config.port}`);
});

const shutdown = (): void => {
  server.close(() => process.exit(0));
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
