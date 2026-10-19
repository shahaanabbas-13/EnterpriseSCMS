import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { AppEvents } from '../types';

/**
 * Application-level event emitter.
 * Used for decoupled communication between modules.
 *
 * Example:
 *   appEvents.emit(AppEvents.STOCK_CHANGED, { productId, quantity });
 *   appEvents.on(AppEvents.STOCK_CHANGED, (data) => { ... });
 *
 * This replaces tight coupling between services.
 * Events can trigger BullMQ jobs, Socket.io broadcasts, audit logs, etc.
 */
class AppEventEmitter extends EventEmitter {
  constructor() {
    super();
    // Allow many listeners (one event may trigger multiple handlers)
    this.setMaxListeners(20);
  }

  /**
   * Type-safe emit wrapper.
   */
  emitEvent(event: AppEvents, data: unknown): boolean {
    logger.debug(`Event emitted: ${event}`, data);
    return this.emit(event, data);
  }

  /**
   * Type-safe on wrapper.
   */
  onEvent(event: AppEvents, handler: (data: any) => void): this {
    logger.debug(`Event listener registered: ${event}`);
    return this.on(event, handler);
  }
}

export const appEvents = new AppEventEmitter();
