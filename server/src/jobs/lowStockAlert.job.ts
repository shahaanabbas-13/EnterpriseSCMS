import { Job } from 'bullmq';
import { getQueue, registerWorker } from './queue';
import { QUEUES } from '../utils/constants';
import { logger } from '../utils/logger';
import { getIO } from '../config/socket';
import { SocketEvents } from '../types';

interface LowStockAlertData {
  productId: string;
  sku: string;
  name: string;
  currentStock: number;
  reorderPoint: number;
  warehouseId: string;
}

/**
 * Low stock alert job processor.
 * When stock falls below reorder point:
 * 1. Push real-time alert via Socket.io to warehouse room + admin room
 * 2. Future: send email / SMS notification
 */
const processLowStockAlert = async (job: Job<LowStockAlertData>): Promise<void> => {
  const { sku, name, currentStock, reorderPoint, warehouseId } = job.data;

  logger.warn(
    `[LOW STOCK JOB] ${sku} - ${name}: ${currentStock} units (reorder at ${reorderPoint})`
  );

  // Push real-time alert to dashboard
  try {
    const io = getIO();
    io.to(`warehouse:${warehouseId}`).emit(SocketEvents.LOW_STOCK_ALERT, {
      productId: job.data.productId,
      sku,
      name,
      currentStock,
      reorderPoint,
      timestamp: new Date().toISOString(),
    });

    io.to('role:ADMIN').emit(SocketEvents.LOW_STOCK_ALERT, {
      productId: job.data.productId,
      sku,
      name,
      currentStock,
      reorderPoint,
      warehouseId,
      timestamp: new Date().toISOString(),
    });
  } catch {
    logger.debug('Socket.io not available for low stock alert broadcast');
  }
};

/**
 * Add a low-stock alert to the queue.
 */
export const enqueueLowStockAlert = async (data: LowStockAlertData): Promise<void> => {
  const queue = getQueue(QUEUES.LOW_STOCK_ALERT);
  await queue.add('low-stock-alert', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  });
};

/**
 * Initialize the low-stock alert worker.
 */
export const initLowStockAlertWorker = (): void => {
  registerWorker(QUEUES.LOW_STOCK_ALERT, processLowStockAlert, 2);
  logger.info('Low stock alert worker initialized');
};
