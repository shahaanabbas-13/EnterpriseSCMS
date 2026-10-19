import { Queue, Worker, QueueEvents, Job } from 'bullmq';
import { logger } from '../utils/logger';
import { QUEUES } from '../utils/constants';
import config from '../config';

/**
 * BullMQ queue setup.
 * All async background jobs go through here:
 * - Low stock alerts
 * - Order notifications
 * - Shipment alerts
 * - Report generation
 * - Audit logging
 *
 * Each queue gets its own worker that processes jobs.
 * Workers will be registered in later phases.
 */

const redisConnection = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  maxRetriesPerRequest: null as null,
};

// ─── Queue Registry ─────────────────────────────────────────

const queues: Map<string, Queue> = new Map();
const workers: Map<string, Worker> = new Map();

/**
 * Get or create a queue by name.
 */
export const getQueue = (name: string): Queue => {
  if (!queues.has(name)) {
    const queue = new Queue(name, { connection: redisConnection });
    queues.set(name, queue);
    logger.info(`Queue created: ${name}`);
  }
  return queues.get(name)!;
};

/**
 * Register a worker for a queue.
 * @param name - Queue name
 * @param processor - Job handler function
 * @param concurrency - How many jobs to process in parallel
 */
export const registerWorker = (
  name: string,
  processor: (job: Job) => Promise<void>,
  concurrency = 3
): Worker => {
  const worker = new Worker(name, processor, {
    connection: redisConnection,
    concurrency,
  });

  worker.on('completed', (job) => {
    logger.debug(`Job completed: ${name}/${job.id}`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Job failed: ${name}/${job?.id}`, err.message);
  });

  workers.set(name, worker);
  logger.info(`Worker registered: ${name} (concurrency: ${concurrency})`);
  return worker;
};

/**
 * Initialize all standard queues.
 * Called during server startup.
 */
export const initializeQueues = (): void => {
  Object.values(QUEUES).forEach((queueName) => {
    getQueue(queueName);
  });
  logger.info(`All queues initialized (${Object.values(QUEUES).length} queues)`);
};

/**
 * Gracefully shut down all queues and workers.
 */
export const shutdownQueues = async (): Promise<void> => {
  for (const [name, worker] of workers) {
    await worker.close();
    logger.info(`Worker closed: ${name}`);
  }
  for (const [name, queue] of queues) {
    await queue.close();
    logger.info(`Queue closed: ${name}`);
  }
  workers.clear();
  queues.clear();
};
