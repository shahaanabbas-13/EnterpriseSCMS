import { Response } from 'express';
import { VendorService } from '../services/vendor.service';
import { AuditService } from '../services/audit.service';
import { ApiResponse } from '../utils/ApiResponse';
import { AuthRequest, AuditAction, VendorStatus, PurchaseOrderStatus } from '../types';
import { str, strOrUndefined, numOrUndefined } from '../utils/express-helpers';

/**
 * Vendor controller.
 * Handles HTTP layer for vendors and purchase orders.
 */
export class VendorController {
  // ─── Vendor Endpoints ──────────────────────────────────────────────

  static async createVendor(req: AuthRequest, res: Response): Promise<void> {
    const vendor = await VendorService.createVendor(req.body);

    await AuditService.log({
      userId: req.user!.userId,
      action: AuditAction.CREATE,
      entity: 'Vendor',
      entityId: vendor._id.toString(),
      newValue: { code: vendor.code, name: vendor.name },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    ApiResponse.created(res, vendor, 'Vendor created');
  }

  static async getVendors(req: AuthRequest, res: Response): Promise<void> {
    const result = await VendorService.getVendors(
      {
        status: strOrUndefined(req.query.status) as VendorStatus | undefined,
        category: strOrUndefined(req.query.category),
        search: strOrUndefined(req.query.search),
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
      'Vendors retrieved'
    );
  }

  static async getVendorById(req: AuthRequest, res: Response): Promise<void> {
    const vendor = await VendorService.getVendorById(str(req.params.id));
    ApiResponse.success(res, vendor, 'Vendor retrieved');
  }

  static async updateVendor(req: AuthRequest, res: Response): Promise<void> {
    const vendor = await VendorService.updateVendor(str(req.params.id), req.body);

    await AuditService.log({
      userId: req.user!.userId,
      action: AuditAction.UPDATE,
      entity: 'Vendor',
      entityId: vendor._id.toString(),
      newValue: req.body,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    ApiResponse.success(res, vendor, 'Vendor updated');
  }

  static async deleteVendor(req: AuthRequest, res: Response): Promise<void> {
    const id = str(req.params.id);
    await VendorService.deleteVendor(id);

    await AuditService.log({
      userId: req.user!.userId,
      action: AuditAction.DELETE,
      entity: 'Vendor',
      entityId: id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    ApiResponse.success(res, null, 'Vendor deleted');
  }

  static async getVendorPerformance(req: AuthRequest, res: Response): Promise<void> {
    const data = await VendorService.getVendorPerformance(str(req.params.id));
    ApiResponse.success(res, data, 'Vendor performance metrics');
  }

  // ─── Purchase Order Endpoints ────────────────────────────────────

  static async createPurchaseOrder(req: AuthRequest, res: Response): Promise<void> {
    const po = await VendorService.createPurchaseOrder({
      ...req.body,
      expectedDeliveryDate: new Date(req.body.expectedDeliveryDate),
      createdBy: req.user!.userId,
    });

    await AuditService.log({
      userId: req.user!.userId,
      action: AuditAction.CREATE,
      entity: 'PurchaseOrder',
      entityId: po._id.toString(),
      newValue: { poNumber: po.poNumber, vendorId: po.vendorId, totalCost: po.totalCost },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    ApiResponse.created(res, po, 'Purchase order created');
  }

  static async getPurchaseOrders(req: AuthRequest, res: Response): Promise<void> {
    const startDateStr = strOrUndefined(req.query.startDate);
    const endDateStr = strOrUndefined(req.query.endDate);

    const result = await VendorService.getPurchaseOrders(
      {
        vendorId: strOrUndefined(req.query.vendorId),
        warehouseId: strOrUndefined(req.query.warehouseId),
        status: strOrUndefined(req.query.status) as PurchaseOrderStatus | undefined,
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
      'Purchase orders retrieved'
    );
  }

  static async getPurchaseOrderById(req: AuthRequest, res: Response): Promise<void> {
    const po = await VendorService.getPurchaseOrderById(str(req.params.id));
    ApiResponse.success(res, po, 'Purchase order retrieved');
  }

  static async updatePurchaseOrderStatus(req: AuthRequest, res: Response): Promise<void> {
    const po = await VendorService.updatePurchaseOrderStatus(
      str(req.params.id),
      req.body.status,
      req.user!.userId
    );

    await AuditService.log({
      userId: req.user!.userId,
      action: AuditAction.STATUS_CHANGE,
      entity: 'PurchaseOrder',
      entityId: po._id.toString(),
      newValue: { status: po.status, poNumber: po.poNumber },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    ApiResponse.success(res, po, `Purchase order status updated to ${po.status}`);
  }
}
