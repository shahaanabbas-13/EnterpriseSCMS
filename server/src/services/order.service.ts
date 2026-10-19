import mongoose from 'mongoose';
import { Order, IOrderDocument } from '../models/Order.model';
import { Product } from '../models/Product.model';
import { OrderStateMachine } from './orderStateMachine';
import { InventoryService } from './inventory.service';
import { ApiError } from '../utils/ApiError';
import {
  OrderStatus,
  StockMovementType,
  PaginationQuery,
  PaginatedResult,
  AppEvents,
} from '../types';
import { appEvents } from '../events';
import { PAGINATION } from '../utils/constants';
import { logger } from '../utils/logger';

/**
 * Order service.
 * Handles order CRUD and state transitions with side effects.
 *
 * Side effects per transition:
 * - CREATED → APPROVED:  Stock reservation check (verify sufficient inventory)
 * - PACKED → SHIPPED:   Create StockMovement OUT for each item
 * - Any transition:       Update statusHistory, set timestamp, emit event
 */
export class OrderService {
  // ─── Order CRUD ───────────────────────────────────────────────

  static async createOrder(data: {
    customer: {
      name: string;
      email: string;
      phone: string;
      address: {
        street: string;
        city: string;
        state: string;
        country: string;
        zipCode?: string;
      };
    };
    items: Array<{
      productId: string;
      quantity: number;
    }>;
    warehouseId: string;
    tax?: number;
    shippingCost?: number;
    notes?: string;
    createdBy: string;
  }): Promise<IOrderDocument> {
    // Resolve product details and validate stock availability
    const resolvedItems = await Promise.all(
      data.items.map(async (item) => {
        const product = await Product.findById(item.productId);
        if (!product) {
          throw ApiError.notFound(`Product not found: ${item.productId}`);
        }
        if (!product.isActive) {
          throw ApiError.badRequest(`Product ${product.sku} is inactive`);
        }
        if (product.currentStock < item.quantity) {
          throw ApiError.badRequest(
            `Insufficient stock for ${product.sku}: available ${product.currentStock}, requested ${item.quantity}`
          );
        }

        return {
          productId: new mongoose.Types.ObjectId(item.productId),
          productName: product.name,
          sku: product.sku,
          quantity: item.quantity,
          unitPrice: product.price,
          totalPrice: item.quantity * product.price,
        };
      })
    );

    const subtotal = resolvedItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const tax = data.tax || 0;
    const shippingCost = data.shippingCost || 0;
    const totalAmount = subtotal + tax + shippingCost;

    // Generate order number: ORD-YYYYMMDD-XXXX
    const count = await Order.countDocuments();
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const orderNumber = `ORD-${dateStr}-${String(count + 1).padStart(4, '0')}`;

    const order = await Order.create({
      orderNumber,
      customer: data.customer,
      items: resolvedItems,
      warehouseId: data.warehouseId,
      status: OrderStatus.CREATED,
      subtotal,
      tax,
      shippingCost,
      totalAmount,
      notes: data.notes,
      createdBy: data.createdBy,
      statusHistory: [
        {
          status: OrderStatus.CREATED,
          timestamp: new Date(),
          changedBy: new mongoose.Types.ObjectId(data.createdBy),
          note: 'Order created',
        },
      ],
    });

    appEvents.emitEvent(AppEvents.ORDER_CREATED, {
      orderId: order._id,
      orderNumber: order.orderNumber,
      totalAmount: order.totalAmount,
    });

    logger.info(`Order created: ${order.orderNumber} (${order.totalAmount})`);
    return order;
  }

  static async getOrders(
    filters: {
      status?: OrderStatus;
      warehouseId?: string;
      customerEmail?: string;
      createdBy?: string;
      assignedTo?: string;
      startDate?: Date;
      endDate?: Date;
    },
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<IOrderDocument>> {
    const {
      page = PAGINATION.DEFAULT_PAGE,
      limit = PAGINATION.DEFAULT_LIMIT,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = pagination;

    const query: Record<string, unknown> = {};
    if (filters.status) query.status = filters.status;
    if (filters.warehouseId) query.warehouseId = filters.warehouseId;
    if (filters.customerEmail) query['customer.email'] = filters.customerEmail;
    if (filters.createdBy) query.createdBy = filters.createdBy;
    if (filters.assignedTo) query.assignedTo = filters.assignedTo;

    if (filters.startDate || filters.endDate) {
      const dateFilter: Record<string, Date> = {};
      if (filters.startDate) dateFilter.$gte = filters.startDate;
      if (filters.endDate) dateFilter.$lte = filters.endDate;
      query.createdAt = dateFilter;
    }

    const skip = (page - 1) * limit;
    const sortDirection = sortOrder === 'asc' ? 1 : -1;

    const [data, total] = await Promise.all([
      Order.find(query)
        .sort({ [sortBy]: sortDirection })
        .skip(skip)
        .limit(limit)
        .populate('warehouseId', 'name code')
        .populate('createdBy', 'name email')
        .populate('assignedTo', 'name email')
        .lean(),
      Order.countDocuments(query),
    ]);

    return {
      data: data as IOrderDocument[],
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  static async getOrderById(orderId: string): Promise<IOrderDocument> {
    const order = await Order.findById(orderId)
      .populate('warehouseId', 'name code location')
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .populate('statusHistory.changedBy', 'name email');

    if (!order) throw ApiError.notFound('Order not found');
    return order;
  }

  // ─── State Machine Transitions ──────────────────────────────

  /**
   * Transition an order to a new status.
   * This is the CORE method — all status changes go through here.
   *
   * 1. Validates the transition via FSM
   * 2. Runs pre-transition side effects
   * 3. Updates the order
   * 4. Runs post-transition side effects
   * 5. Emits events
   */
  static async transitionOrder(
    orderId: string,
    newStatus: OrderStatus,
    actorId: string,
    note?: string
  ): Promise<IOrderDocument> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const order = await Order.findById(orderId).session(session);
      if (!order) throw ApiError.notFound('Order not found');

      const previousStatus = order.status;

      // 1. Validate transition
      OrderStateMachine.validateTransition(previousStatus, newStatus);

      // 2. Pre-transition side effects
      await this.preTransitionEffects(order, newStatus, actorId, session);

      // 3. Update order status
      order.status = newStatus;
      order.statusHistory.push({
        status: newStatus,
        timestamp: new Date(),
        changedBy: new mongoose.Types.ObjectId(actorId),
        note,
      });

      // Set timestamp fields
      const tsField = OrderStateMachine.getTimestampField(newStatus);
      if (tsField) {
        (order as any)[tsField] = new Date();
      }

      await order.save({ session });

      // 4. Post-transition side effects
      await this.postTransitionEffects(order, previousStatus, newStatus, actorId, session);

      await session.commitTransaction();

      // 5. Emit event (outside transaction)
      appEvents.emitEvent(AppEvents.ORDER_STATUS_CHANGED, {
        orderId: order._id,
        orderNumber: order.orderNumber,
        previousStatus,
        newStatus,
        actorId,
        timestamp: new Date(),
      });

      logger.info(`Order ${order.orderNumber}: ${previousStatus} → ${newStatus}`);
      return order;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Assign an order to a staff member (warehouse manager, picker, etc.).
   */
  static async assignOrder(
    orderId: string,
    assigneeId: string
  ): Promise<IOrderDocument> {
    const order = await Order.findByIdAndUpdate(
      orderId,
      { assignedTo: assigneeId },
      { new: true }
    );
    if (!order) throw ApiError.notFound('Order not found');
    logger.info(`Order ${order.orderNumber} assigned to ${assigneeId}`);
    return order;
  }

  /**
   * Get valid next transitions for an order.
   */
  static async getOrderTransitions(orderId: string): Promise<{
    currentStatus: OrderStatus;
    validTransitions: OrderStatus[];
    isTerminal: boolean;
  }> {
    const order = await Order.findById(orderId);
    if (!order) throw ApiError.notFound('Order not found');

    return {
      currentStatus: order.status,
      validTransitions: OrderStateMachine.getValidTransitions(order.status),
      isTerminal: OrderStateMachine.isTerminalState(order.status),
    };
  }

  // ─── Side Effect Handlers ─────────────────────────────────────

  /**
   * Effects that run BEFORE the status is changed.
   */
  private static async preTransitionEffects(
    order: IOrderDocument,
    newStatus: OrderStatus,
    _actorId: string,
    session: mongoose.ClientSession
  ): Promise<void> {
    // APPROVED: Verify stock is still available
    if (newStatus === OrderStatus.APPROVED) {
      for (const item of order.items) {
        const product = await Product.findById(item.productId).session(session);
        if (!product) {
          throw ApiError.badRequest(`Product ${item.sku} no longer exists`);
        }
        if (product.currentStock < item.quantity) {
          throw ApiError.badRequest(
            `Insufficient stock for ${item.sku}: available ${product.currentStock}, need ${item.quantity}`
          );
        }
      }
    }
  }

  /**
   * Effects that run AFTER the status is changed (within the same transaction).
   */
  private static async postTransitionEffects(
    order: IOrderDocument,
    _previousStatus: OrderStatus,
    newStatus: OrderStatus,
    actorId: string,
    _session: mongoose.ClientSession
  ): Promise<void> {
    // SHIPPED: Create stock OUT movements for each item
    if (newStatus === OrderStatus.SHIPPED) {
      for (const item of order.items) {
        await InventoryService.recordStockMovement({
          productId: item.productId.toString(),
          type: StockMovementType.OUT,
          quantity: item.quantity,
          reason: `Order ${order.orderNumber} shipped`,
          performedBy: actorId,
          referenceType: 'Order',
          referenceId: order._id.toString(),
        });
      }

      // Emit shipment creation event (Phase 5 will listen)
      appEvents.emitEvent(AppEvents.SHIPMENT_CREATED, {
        orderId: order._id,
        orderNumber: order.orderNumber,
        warehouseId: order.warehouseId,
        customer: order.customer,
        items: order.items,
      });
    }

    // RETURNED: Create stock IN movements to restore inventory
    if (newStatus === OrderStatus.RETURNED) {
      for (const item of order.items) {
        await InventoryService.recordStockMovement({
          productId: item.productId.toString(),
          type: StockMovementType.IN,
          quantity: item.quantity,
          reason: `Return from order ${order.orderNumber}`,
          performedBy: actorId,
          referenceType: 'Order',
          referenceId: order._id.toString(),
        });
      }
    }
  }
}
