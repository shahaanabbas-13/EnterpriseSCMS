import mongoose from 'mongoose';
import crypto from 'crypto';
import { Shipment, IShipmentDocument, ICheckpoint } from '../models/Shipment.model';
import { Order } from '../models/Order.model';
import { Warehouse } from '../models/Warehouse.model';
import { ApiError } from '../utils/ApiError';
import { ShipmentStatus, PaginationQuery, PaginatedResult, AppEvents, SocketEvents } from '../types';
import { appEvents } from '../events';
import { getIO } from '../config/socket';
import { PAGINATION } from '../utils/constants';
import { logger } from '../utils/logger';

/**
 * Shipment service.
 * Handles shipment CRUD, status updates, and checkpoint management.
 * Integrates with Socket.io for real-time tracking updates.
 */
export class ShipmentService {
  // ─── Shipment CRUD ────────────────────────────────────────

  static async createShipment(data: {
    orderId: string;
    carrier: { name: string; code: string; contactPhone?: string };
    estimatedDelivery: Date;
    weight?: number;
    dimensions?: { length: number; width: number; height: number };
    shippingCost: number;
    createdBy: string;
  }): Promise<IShipmentDocument> {
    // Verify order exists
    const order = await Order.findById(data.orderId).populate('warehouseId');
    if (!order) throw ApiError.notFound('Order not found');

    // Check no existing shipment for this order
    const existingShipment = await Shipment.findOne({ orderId: data.orderId });
    if (existingShipment) {
      throw ApiError.conflict(
        `Shipment already exists for order ${order.orderNumber}: ${existingShipment.trackingId}`
      );
    }

    // Get warehouse for origin
    const warehouse = await Warehouse.findById(order.warehouseId);
    if (!warehouse) throw ApiError.notFound('Warehouse not found');

    // Generate tracking ID: TRK-XXXXXXXX
    const trackingId = `TRK-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    const shipment = await Shipment.create({
      orderId: data.orderId,
      trackingId,
      carrier: data.carrier,
      status: ShipmentStatus.CREATED,
      checkpoints: [
        {
          location: `${warehouse.name}, ${warehouse.location.city}`,
          timestamp: new Date(),
          status: 'Shipment created',
          note: 'Package ready for pickup',
        },
      ],
      origin: {
        warehouseId: warehouse._id,
        address: warehouse.location.address,
        city: warehouse.location.city,
        state: warehouse.location.state,
        country: warehouse.location.country,
      },
      destination: {
        name: order.customer.name,
        address: order.customer.address.street,
        city: order.customer.address.city,
        state: order.customer.address.state,
        country: order.customer.address.country,
        zipCode: order.customer.address.zipCode,
      },
      estimatedDelivery: data.estimatedDelivery,
      weight: data.weight,
      dimensions: data.dimensions,
      shippingCost: data.shippingCost,
      createdBy: data.createdBy,
    });

    logger.info(`Shipment created: ${trackingId} for order ${order.orderNumber}`);
    return shipment;
  }

  static async getShipments(
    filters: {
      status?: ShipmentStatus;
      carrierId?: string;
      orderId?: string;
      startDate?: Date;
      endDate?: Date;
    },
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<IShipmentDocument>> {
    const { page = PAGINATION.DEFAULT_PAGE, limit = PAGINATION.DEFAULT_LIMIT } = pagination;

    const query: Record<string, unknown> = {};
    if (filters.status) query.status = filters.status;
    if (filters.carrierId) query['carrier.code'] = filters.carrierId;
    if (filters.orderId) query.orderId = filters.orderId;

    if (filters.startDate || filters.endDate) {
      const dateFilter: Record<string, Date> = {};
      if (filters.startDate) dateFilter.$gte = filters.startDate;
      if (filters.endDate) dateFilter.$lte = filters.endDate;
      query.createdAt = dateFilter;
    }

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      Shipment.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('orderId', 'orderNumber customer.name totalAmount')
        .populate('createdBy', 'name email')
        .lean(),
      Shipment.countDocuments(query),
    ]);

    return {
      data: data as IShipmentDocument[],
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  static async getShipmentById(shipmentId: string): Promise<IShipmentDocument> {
    const shipment = await Shipment.findById(shipmentId)
      .populate('orderId', 'orderNumber customer totalAmount status')
      .populate('createdBy', 'name email');

    if (!shipment) throw ApiError.notFound('Shipment not found');
    return shipment;
  }

  static async getShipmentByTrackingId(trackingId: string): Promise<IShipmentDocument> {
    const shipment = await Shipment.findOne({ trackingId: trackingId.toUpperCase() })
      .populate('orderId', 'orderNumber customer totalAmount status');

    if (!shipment) throw ApiError.notFound('Shipment not found');
    return shipment;
  }

  // ─── Status Updates ────────────────────────────────────────

  static async updateShipmentStatus(
    shipmentId: string,
    newStatus: ShipmentStatus,
    location: string,
    note?: string
  ): Promise<IShipmentDocument> {
    const shipment = await Shipment.findById(shipmentId);
    if (!shipment) throw ApiError.notFound('Shipment not found');

    // Validate status progression
    const validTransitions: Record<string, ShipmentStatus[]> = {
      [ShipmentStatus.CREATED]: [ShipmentStatus.PICKED_UP],
      [ShipmentStatus.PICKED_UP]: [ShipmentStatus.IN_TRANSIT],
      [ShipmentStatus.IN_TRANSIT]: [
        ShipmentStatus.OUT_FOR_DELIVERY,
        ShipmentStatus.DELAYED,
      ],
      [ShipmentStatus.DELAYED]: [
        ShipmentStatus.IN_TRANSIT,
        ShipmentStatus.OUT_FOR_DELIVERY,
        ShipmentStatus.FAILED,
      ],
      [ShipmentStatus.OUT_FOR_DELIVERY]: [
        ShipmentStatus.DELIVERED,
        ShipmentStatus.FAILED,
      ],
      [ShipmentStatus.DELIVERED]: [],
      [ShipmentStatus.FAILED]: [],
    };

    const allowed = validTransitions[shipment.status] || [];
    if (!allowed.includes(newStatus)) {
      throw ApiError.badRequest(
        `Cannot transition shipment from ${shipment.status} to ${newStatus}. Allowed: ${allowed.join(', ') || 'none'}`
      );
    }

    const previousStatus = shipment.status;
    shipment.status = newStatus;

    // Add checkpoint
    shipment.checkpoints.push({
      location,
      timestamp: new Date(),
      status: newStatus,
      note,
    });

    // Set actual delivery date
    if (newStatus === ShipmentStatus.DELIVERED) {
      shipment.actualDelivery = new Date();
    }

    await shipment.save();

    // Broadcast via Socket.io
    try {
      const io = getIO();
      io.emit(SocketEvents.SHIPMENT_UPDATE, {
        shipmentId: shipment._id,
        trackingId: shipment.trackingId,
        orderId: shipment.orderId,
        previousStatus,
        newStatus,
        location,
        timestamp: new Date().toISOString(),
      });

      if (newStatus === ShipmentStatus.DELAYED) {
        io.to('role:ADMIN').emit(SocketEvents.SHIPMENT_DELAYED, {
          shipmentId: shipment._id,
          trackingId: shipment.trackingId,
          orderId: shipment.orderId,
          location,
          note,
        });
      }
    } catch {
      logger.debug('Socket.io not available for shipment update broadcast');
    }

    // Emit app events
    appEvents.emitEvent(AppEvents.SHIPMENT_CHECKPOINT_ADDED, {
      shipmentId: shipment._id,
      trackingId: shipment.trackingId,
      status: newStatus,
      location,
    });

    if (newStatus === ShipmentStatus.DELAYED) {
      appEvents.emitEvent(AppEvents.SHIPMENT_DELAYED, {
        shipmentId: shipment._id,
        trackingId: shipment.trackingId,
        orderId: shipment.orderId,
        estimatedDelivery: shipment.estimatedDelivery,
      });
    }

    logger.info(
      `Shipment ${shipment.trackingId}: ${previousStatus} → ${newStatus} at ${location}`
    );
    return shipment;
  }

  /**
   * Add a checkpoint without changing status (for tracking updates).
   */
  static async addCheckpoint(
    shipmentId: string,
    checkpoint: { location: string; status: string; note?: string }
  ): Promise<IShipmentDocument> {
    const shipment = await Shipment.findById(shipmentId);
    if (!shipment) throw ApiError.notFound('Shipment not found');

    shipment.checkpoints.push({
      ...checkpoint,
      timestamp: new Date(),
    });

    await shipment.save();

    // Broadcast checkpoint update
    try {
      const io = getIO();
      io.emit(SocketEvents.SHIPMENT_UPDATE, {
        shipmentId: shipment._id,
        trackingId: shipment.trackingId,
        type: 'checkpoint',
        checkpoint: { ...checkpoint, timestamp: new Date().toISOString() },
      });
    } catch {
      logger.debug('Socket.io not available for checkpoint broadcast');
    }

    logger.debug(`Checkpoint added to ${shipment.trackingId}: ${checkpoint.status}`);
    return shipment;
  }

  // ─── Analytics Helpers ────────────────────────────────────────

  /**
   * Get delayed shipments (past estimated delivery, not yet delivered).
   */
  static async getDelayedShipments(): Promise<IShipmentDocument[]> {
    return Shipment.find({
      status: { $nin: [ShipmentStatus.DELIVERED, ShipmentStatus.FAILED] },
      estimatedDelivery: { $lt: new Date() },
    })
      .populate('orderId', 'orderNumber customer.name')
      .sort({ estimatedDelivery: 1 })
      .lean() as Promise<IShipmentDocument[]>;
  }

  /**
   * Get shipment statistics.
   */
  static async getShipmentStats(): Promise<{
    total: number;
    byStatus: Array<{ status: string; count: number }>;
    avgDeliveryDays: number;
    onTimeRate: number;
    delayed: number;
  }> {
    const [statusBreakdown] = await Shipment.aggregate([
      {
        $facet: {
          byStatus: [
            { $group: { _id: '$status', count: { $sum: 1 } } },
            { $project: { status: '$_id', count: 1, _id: 0 } },
            { $sort: { count: -1 } },
          ],
          total: [{ $count: 'count' }],
          deliveryStats: [
            {
              $match: {
                status: ShipmentStatus.DELIVERED,
                actualDelivery: { $exists: true },
              },
            },
            {
              $addFields: {
                deliveryDays: {
                  $divide: [
                    { $subtract: ['$actualDelivery', '$createdAt'] },
                    1000 * 60 * 60 * 24,
                  ],
                },
                isOnTime: { $lte: ['$actualDelivery', '$estimatedDelivery'] },
              },
            },
            {
              $group: {
                _id: null,
                avgDeliveryDays: { $avg: '$deliveryDays' },
                totalDelivered: { $sum: 1 },
                onTimeCount: { $sum: { $cond: ['$isOnTime', 1, 0] } },
              },
            },
          ],
          delayed: [
            {
              $match: {
                status: { $nin: [ShipmentStatus.DELIVERED, ShipmentStatus.FAILED] },
                estimatedDelivery: { $lt: new Date() },
              },
            },
            { $count: 'count' },
          ],
        },
      },
    ]);

    const total = statusBreakdown?.total?.[0]?.count || 0;
    const deliveryStats = statusBreakdown?.deliveryStats?.[0] || {
      avgDeliveryDays: 0,
      totalDelivered: 0,
      onTimeCount: 0,
    };
    const delayed = statusBreakdown?.delayed?.[0]?.count || 0;

    return {
      total,
      byStatus: statusBreakdown?.byStatus || [],
      avgDeliveryDays: Math.round((deliveryStats.avgDeliveryDays || 0) * 10) / 10,
      onTimeRate:
        deliveryStats.totalDelivered > 0
          ? Math.round((deliveryStats.onTimeCount / deliveryStats.totalDelivered) * 100)
          : 0,
      delayed,
    };
  }
}
