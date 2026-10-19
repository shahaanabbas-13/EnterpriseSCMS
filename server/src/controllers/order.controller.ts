import { Response } from 'express';
import { OrderService } from '../services/order.service';
import { AuditService } from '../services/audit.service';
import { ApiResponse } from '../utils/ApiResponse';
import { AuthRequest, AuditAction, OrderStatus } from '../types';
import { str, strOrUndefined, numOrUndefined } from '../utils/express-helpers';

/**
 * Order controller.
 * Handles HTTP layer for order CRUD and state transitions.
 */
export class OrderController {
  static async createOrder(req: AuthRequest, res: Response): Promise<void> {
    const order = await OrderService.createOrder({
      ...req.body,
      createdBy: req.user!.userId,
    });

    await AuditService.log({
      userId: req.user!.userId,
      action: AuditAction.CREATE,
      entity: 'Order',
      entityId: order._id.toString(),
      newValue: { orderNumber: order.orderNumber, totalAmount: order.totalAmount, status: order.status },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    ApiResponse.created(res, order, 'Order created successfully');
  }

  static async getOrders(req: AuthRequest, res: Response): Promise<void> {
    const startDateStr = strOrUndefined(req.query.startDate);
    const endDateStr = strOrUndefined(req.query.endDate);

    const result = await OrderService.getOrders(
      {
        status: strOrUndefined(req.query.status) as OrderStatus | undefined,
        warehouseId: strOrUndefined(req.query.warehouseId),
        customerEmail: strOrUndefined(req.query.customerEmail),
        createdBy: strOrUndefined(req.query.createdBy),
        assignedTo: strOrUndefined(req.query.assignedTo),
        startDate: startDateStr ? new Date(startDateStr) : undefined,
        endDate: endDateStr ? new Date(endDateStr) : undefined,
      },
      {
        page: numOrUndefined(req.query.page),
        limit: numOrUndefined(req.query.limit),
        sortBy: strOrUndefined(req.query.sortBy),
        sortOrder: strOrUndefined(req.query.sortOrder) as 'asc' | 'desc' | undefined,
      }
    );

    ApiResponse.paginated(
      res,
      result.data,
      result.pagination.total,
      result.pagination.page,
      result.pagination.limit,
      'Orders retrieved'
    );
  }

  static async getOrderById(req: AuthRequest, res: Response): Promise<void> {
    const order = await OrderService.getOrderById(str(req.params.id));
    ApiResponse.success(res, order, 'Order retrieved');
  }

  /**
   * Transition order status — the FSM endpoint.
   * PATCH /api/orders/:id/status
   */
  static async updateOrderStatus(req: AuthRequest, res: Response): Promise<void> {
    const order = await OrderService.transitionOrder(
      str(req.params.id),
      req.body.status,
      req.user!.userId,
      req.body.note
    );

    await AuditService.log({
      userId: req.user!.userId,
      action: AuditAction.STATUS_CHANGE,
      entity: 'Order',
      entityId: order._id.toString(),
      newValue: { status: order.status, orderNumber: order.orderNumber },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    ApiResponse.success(res, order, `Order status updated to ${order.status}`);
  }

  static async assignOrder(req: AuthRequest, res: Response): Promise<void> {
    const order = await OrderService.assignOrder(
      str(req.params.id),
      req.body.assigneeId
    );

    await AuditService.log({
      userId: req.user!.userId,
      action: AuditAction.UPDATE,
      entity: 'Order',
      entityId: order._id.toString(),
      newValue: { assignedTo: req.body.assigneeId, orderNumber: order.orderNumber },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    ApiResponse.success(res, order, 'Order assigned');
  }

  /**
   * GET /api/orders/:id/transitions
   * Returns valid next states for the order (useful for frontend buttons).
   */
  static async getOrderTransitions(req: AuthRequest, res: Response): Promise<void> {
    const data = await OrderService.getOrderTransitions(str(req.params.id));
    ApiResponse.success(res, data, 'Order transitions retrieved');
  }
}
