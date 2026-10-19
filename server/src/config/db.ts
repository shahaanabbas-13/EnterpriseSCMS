import mongoose from 'mongoose';
import config from './index';
import { logger } from '../utils/logger';

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000;

export const connectDB = async (): Promise<void> => {
  let retries = 0;

  while (retries < MAX_RETRIES) {
    try {
      await mongoose.connect(config.mongo.uri, {
        // Mongoose 9 defaults are good — no need for deprecated options
      });

      logger.info(`MongoDB connected: ${mongoose.connection.host}`);

      // Connection event listeners
      mongoose.connection.on('error', (err) => {
        logger.error('MongoDB connection error:', err);
      });

      mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected. Attempting reconnection...');
      });

      return; // Success — exit retry loop
    } catch (error) {
      retries++;
      logger.error(
        `MongoDB connection attempt ${retries}/${MAX_RETRIES} failed:`,
        error
      );

      if (retries >= MAX_RETRIES) {
        logger.error('Max MongoDB connection retries reached. Exiting.');
        process.exit(1);
      }

      logger.info(`Retrying in ${RETRY_DELAY_MS / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
};

export const disconnectDB = async (): Promise<void> => {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected gracefully.');
};
