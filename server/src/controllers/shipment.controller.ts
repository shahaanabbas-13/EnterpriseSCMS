import { Response } from 'express';
import { ShipmentService } from '../services/shipment.service';
import { AuditService } from '../services/audit.service';
import { ApiResponse } from '../utils/ApiResponse';
import { AuthRequest, AuditAction, ShipmentStatus } from '../types';
import { str, strOrUndefined, numOrUndefined } from '../utils/express-helpers';

/**
 * Shipment controller.
 * Handles HTTP layer for shipment tracking and management.
 */
export class ShipmentController {
  static async createShipment(req: AuthRequest, res: Response): Promise<void> {
    const shipment = await ShipmentService.createShipment({
      ...req.body,
      estimatedDelivery: new Date(req.body.estimatedDelivery),
      createdBy: req.user!.userId,
    });

    await AuditService.log({
      userId: req.user!.userId,
      action: AuditAction.CREATE,
      entity: 'Shipment',
      entityId: shipment._id.toString(),
      newValue: { trackingId: shipment.trackingId, orderId: shipment.orderId },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    ApiResponse.created(res, shipment, 'Shipment created');
  }

  static async getShipments(req: AuthRequest, res: Response): Promise<void> {
    const startDateStr = strOrUndefined(req.query.startDate);
    const endDateStr = strOrUndefined(req.query.endDate);

    const result = await ShipmentService.getShipments(
      {
        status: strOrUndefined(req.query.status) as ShipmentStatus | undefined,
        carrierId: strOrUndefined(req.query.carrierId),
        orderId: strOrUndefined(req.query.orderId),
        startDate: startDateStr ? new Date(startDateStr) : undefined,
        endDate: endDateStr ? new Date(endDateStr) : undefined,
      },
      {
        page: numOrUndefined(req.query.page),
        limit: numOrUndefined(req.query.limit),
      }
    );

    ApiResponse.paginated(
      res,
      result.data,
      result.pagination.total,
      result.pagination.page,
      result.pagination.limit,
      'Shipments retrieved'
    );
  }

  static async getShipmentById(req: AuthRequest, res: Response): Promise<void> {
    const shipment = await ShipmentService.getShipmentById(str(req.params.id));
    ApiResponse.success(res, shipment, 'Shipment retrieved');
  }

  static async trackShipment(req: AuthRequest, res: Response): Promise<void> {
    const shipment = await ShipmentService.getShipmentByTrackingId(
      str(req.params.trackingId)
    );
    ApiResponse.success(res, shipment, 'Shipment tracking info');
  }

  static async updateShipmentStatus(req: AuthRequest, res: Response): Promise<void> {
    const shipment = await ShipmentService.updateShipmentStatus(
      str(req.params.id),
      req.body.status,
      req.body.location,
      req.body.note
    );

    await AuditService.log({
      userId: req.user!.userId,
      action: AuditAction.STATUS_CHANGE,
      entity: 'Shipment',
      entityId: shipment._id.toString(),
      newValue: { status: shipment.status, trackingId: shipment.trackingId },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    ApiResponse.success(res, shipment, `Shipment status updated to ${shipment.status}`);
  }

  static async addCheckpoint(req: AuthRequest, res: Response): Promise<void> {
    const shipment = await ShipmentService.addCheckpoint(
      str(req.params.id),
      req.body
    );

    ApiResponse.success(res, shipment, 'Checkpoint added');
  }

  static async getDelayedShipments(_req: AuthRequest, res: Response): Promise<void> {
    const data = await ShipmentService.getDelayedShipments();
    ApiResponse.success(res, data, 'Delayed shipments');
  }

  static async getShipmentStats(_req: AuthRequest, res: Response): Promise<void> {
    const data = await ShipmentService.getShipmentStats();
    ApiResponse.success(res, data, 'Shipment statistics');
  }
}
