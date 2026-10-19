import { appEvents } from './index';
import { AppEvents, SocketEvents } from '../types';
import { enqueueLowStockAlert } from '../jobs/lowStockAlert.job';
import { getIO } from '../config/socket';
import { logger } from '../utils/logger';

/**
 * Register stock-related event listeners.
 * Bridges domain events to side effects (Socket.io, BullMQ jobs).
 *
 * This is the decoupling layer:
 * - InventoryService emits AppEvents.STOCK_CHANGED
 * - This listener broadcasts via Socket.io + enqueues alert jobs
 * - No circular dependency between services
 */
export const registerStockEventListeners = (): void => {
  // Stock changed \u2192 broadcast via Socket.io
  appEvents.onEvent(AppEvents.STOCK_CHANGED, (data) => {
    try {
      const io = getIO();
      io.to(`warehouse:${data.warehouseId}`).emit(SocketEvents.STOCK_UPDATE, data);
    } catch {
      logger.debug('Socket.io not available for stock update broadcast');
    }
  });

  // Low stock detected \u2192 enqueue alert job
  appEvents.onEvent(AppEvents.LOW_STOCK_DETECTED, async (data) => {
    try {
      await enqueueLowStockAlert({
        productId: data.productId.toString(),
        sku: data.sku,
        name: data.name,
        currentStock: data.currentStock,
        reorderPoint: data.reorderPoint,
        warehouseId: data.warehouseId.toString(),
      });
    } catch (err) {
      logger.error('Failed to enqueue low stock alert:', err);
    }
  });

  logger.info('Stock event listeners registered');
};
