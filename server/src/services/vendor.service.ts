import mongoose from 'mongoose';
import { Vendor, IVendorDocument } from '../models/Vendor.model';
import {
  PurchaseOrder,
  IPurchaseOrderDocument,
} from '../models/PurchaseOrder.model';
import { ApiError } from '../utils/ApiError';
import {
  VendorStatus,
  PurchaseOrderStatus,
  PaginationQuery,
  PaginatedResult,
  AppEvents,
} from '../types';
import { appEvents } from '../events';
import { PAGINATION } from '../utils/constants';
import { logger } from '../utils/logger';

/**
 * Vendor service.
 * Handles vendor CRUD, purchase order lifecycle, and performance scoring.
 *
 * Performance score is COMPUTED via aggregation, never stored directly.
 * This ensures the score is always accurate and auditable.
 */
export class VendorService {
  // ─── Vendor CRUD ──────────────────────────────────────────────

  static async createVendor(data: {
    name: string;
    code: string;
    contactInfo: {
      email: string;
      phone: string;
      contactPerson: string;
      address: {
        street: string;
        city: string;
        state: string;
        country: string;
        zipCode?: string;
      };
    };
    categories?: string[];
    paymentTerms?: string;
    leadTimeDays?: number;
    notes?: string;
  }): Promise<IVendorDocument> {
    const existing = await Vendor.findOne({ code: data.code.toUpperCase() });
    if (existing) {
      throw ApiError.conflict(`Vendor with code ${data.code} already exists`);
    }

    const vendor = await Vendor.create({
      ...data,
      code: data.code.toUpperCase(),
    });

    logger.info(`Vendor created: ${vendor.code} - ${vendor.name}`);
    return vendor;
  }

  static async getVendors(
    filters: {
      status?: VendorStatus;
      category?: string;
      search?: string;
    },
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<IVendorDocument>> {
    const {
      page = PAGINATION.DEFAULT_PAGE,
      limit = PAGINATION.DEFAULT_LIMIT,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = pagination;

    const query: Record<string, unknown> = {};
    if (filters.status) query.status = filters.status;
    if (filters.category) query.categories = filters.category;
    if (filters.search) query.$text = { $search: filters.search };

    const skip = (page - 1) * limit;
    const sortDirection = sortOrder === 'asc' ? 1 : -1;

    const [data, total] = await Promise.all([
      Vendor.find(query)
        .sort({ [sortBy]: sortDirection })
        .skip(skip)
        .limit(limit)
        .lean(),
      Vendor.countDocuments(query),
    ]);

    return {
      data: data as IVendorDocument[],
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  static async getVendorById(vendorId: string): Promise<IVendorDocument> {
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) throw ApiError.notFound('Vendor not found');
    return vendor;
  }

  static async updateVendor(
    vendorId: string,
    updates: Partial<{
      name: string;
      contactInfo: IVendorDocument['contactInfo'];
      categories: string[];
      status: VendorStatus;
      paymentTerms: string;
      leadTimeDays: number;
      notes: string;
    }>
  ): Promise<IVendorDocument> {
    const vendor = await Vendor.findByIdAndUpdate(
      vendorId,
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!vendor) throw ApiError.notFound('Vendor not found');
    logger.info(`Vendor updated: ${vendor.code}`);
    return vendor;
  }

  static async deleteVendor(vendorId: string): Promise<void> {
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) throw ApiError.notFound('Vendor not found');

    const activePOs = await PurchaseOrder.countDocuments({
      vendorId,
      status: { $nin: [PurchaseOrderStatus.CLOSED, PurchaseOrderStatus.DELIVERED] },
    });
    if (activePOs > 0) {
      throw ApiError.badRequest(
        `Cannot delete vendor with ${activePOs} active purchase orders`
      );
    }

    await Vendor.findByIdAndDelete(vendorId);
    logger.info(`Vendor deleted: ${vendor.code}`);
  }

  // ─── Purchase Order Lifecycle ─────────────────────────────

  static async createPurchaseOrder(data: {
    vendorId: string;
    warehouseId: string;
    items: Array<{
      productId: string;
      productName: string;
      sku: string;
      quantity: number;
      unitPrice: number;
    }>;
    expectedDeliveryDate: Date;
    notes?: string;
    createdBy: string;
  }): Promise<IPurchaseOrderDocument> {
    // Verify vendor exists and is active
    const vendor = await Vendor.findById(data.vendorId);
    if (!vendor) throw ApiError.notFound('Vendor not found');
    if (vendor.status !== VendorStatus.ACTIVE) {
      throw ApiError.badRequest('Cannot create PO for inactive/blacklisted vendor');
    }

    // Calculate line totals and grand total
    const items = data.items.map((item) => ({
      ...item,
      productId: new mongoose.Types.ObjectId(item.productId),
      totalPrice: item.quantity * item.unitPrice,
    }));
    const totalCost = items.reduce((sum, item) => sum + item.totalPrice, 0);

    // Generate PO number: PO-YYYYMMDD-XXXX
    const count = await PurchaseOrder.countDocuments();
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const poNumber = `PO-${dateStr}-${String(count + 1).padStart(4, '0')}`;

    const po = await PurchaseOrder.create({
      poNumber,
      vendorId: data.vendorId,
      warehouseId: data.warehouseId,
      items,
      totalCost,
      expectedDeliveryDate: data.expectedDeliveryDate,
      notes: data.notes,
      createdBy: data.createdBy,
    });

    logger.info(`Purchase order created: ${po.poNumber} for vendor ${vendor.code}`);
    return po;
  }

  static async getPurchaseOrders(
    filters: {
      vendorId?: string;
      warehouseId?: string;
      status?: PurchaseOrderStatus;
      startDate?: Date;
      endDate?: Date;
    },
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<IPurchaseOrderDocument>> {
    const { page = PAGINATION.DEFAULT_PAGE, limit = PAGINATION.DEFAULT_LIMIT } = pagination;

    const query: Record<string, unknown> = {};
    if (filters.vendorId) query.vendorId = filters.vendorId;
    if (filters.warehouseId) query.warehouseId = filters.warehouseId;
    if (filters.status) query.status = filters.status;

    if (filters.startDate || filters.endDate) {
      const dateFilter: Record<string, Date> = {};
      if (filters.startDate) dateFilter.$gte = filters.startDate;
      if (filters.endDate) dateFilter.$lte = filters.endDate;
      query.createdAt = dateFilter;
    }

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      PurchaseOrder.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('vendorId', 'name code')
        .populate('warehouseId', 'name code')
        .populate('createdBy', 'name email')
        .lean(),
      PurchaseOrder.countDocuments(query),
    ]);

    return {
      data: data as IPurchaseOrderDocument[],
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  static async getPurchaseOrderById(poId: string): Promise<IPurchaseOrderDocument> {
    const po = await PurchaseOrder.findById(poId)
      .populate('vendorId', 'name code contactInfo')
      .populate('warehouseId', 'name code location')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email');

    if (!po) throw ApiError.notFound('Purchase order not found');
    return po;
  }

  /**
   * Transition PO status.
   * Enforced lifecycle: DRAFT → SENT → ACKNOWLEDGED → DELIVERED → CLOSED
   */
  static async updatePurchaseOrderStatus(
    poId: string,
    newStatus: PurchaseOrderStatus,
    actorId: string
  ): Promise<IPurchaseOrderDocument> {
    const po = await PurchaseOrder.findById(poId);
    if (!po) throw ApiError.notFound('Purchase order not found');

    // Validate transition
    const validTransitions: Record<string, PurchaseOrderStatus[]> = {
      [PurchaseOrderStatus.DRAFT]: [PurchaseOrderStatus.SENT],
      [PurchaseOrderStatus.SENT]: [PurchaseOrderStatus.ACKNOWLEDGED],
      [PurchaseOrderStatus.ACKNOWLEDGED]: [PurchaseOrderStatus.DELIVERED],
      [PurchaseOrderStatus.DELIVERED]: [PurchaseOrderStatus.CLOSED],
      [PurchaseOrderStatus.CLOSED]: [],
    };

    const allowed = validTransitions[po.status] || [];
    if (!allowed.includes(newStatus)) {
      throw ApiError.badRequest(
        `Cannot transition PO from ${po.status} to ${newStatus}. Allowed: ${allowed.join(', ') || 'none'}`
      );
    }

    const previousStatus = po.status;
    po.status = newStatus;

    // Set actualDeliveryDate when delivered
    if (newStatus === PurchaseOrderStatus.DELIVERED) {
      po.actualDeliveryDate = new Date();
    }

    // Set approvedBy when sent
    if (newStatus === PurchaseOrderStatus.SENT) {
      po.approvedBy = new mongoose.Types.ObjectId(actorId);
    }

    await po.save();

    // Emit event for vendor performance tracking
    if (newStatus === PurchaseOrderStatus.DELIVERED) {
      appEvents.emitEvent(AppEvents.VENDOR_PERFORMANCE_UPDATE, {
        vendorId: po.vendorId,
        poId: po._id,
        expectedDeliveryDate: po.expectedDeliveryDate,
        actualDeliveryDate: po.actualDeliveryDate,
        totalCost: po.totalCost,
      });
    }

    logger.info(`PO ${po.poNumber}: ${previousStatus} → ${newStatus}`);
    return po;
  }

  // ─── Vendor Performance Analytics ─────────────────────────

  /**
   * Compute vendor performance metrics from PO history.
   * All computed via aggregation — never stored.
   */
  static async getVendorPerformance(vendorId: string): Promise<{
    totalPOs: number;
    deliveredPOs: number;
    onTimeDeliveryRate: number;
    avgLeadTimeDays: number;
    totalSpend: number;
    avgOrderValue: number;
    lateDeliveries: number;
  }> {
    const vendorObjectId = new mongoose.Types.ObjectId(vendorId);

    const [result] = await PurchaseOrder.aggregate([
      { $match: { vendorId: vendorObjectId } },
      {
        $facet: {
          overview: [
            {
              $group: {
                _id: null,
                totalPOs: { $sum: 1 },
                totalSpend: { $sum: '$totalCost' },
              },
            },
          ],
          delivered: [
            {
              $match: {
                status: PurchaseOrderStatus.DELIVERED,
                actualDeliveryDate: { $exists: true },
              },
            },
            {
              $addFields: {
                leadTimeDays: {
                  $divide: [
                    { $subtract: ['$actualDeliveryDate', '$createdAt'] },
                    1000 * 60 * 60 * 24,
                  ],
                },
                isOnTime: {
                  $lte: ['$actualDeliveryDate', '$expectedDeliveryDate'],
                },
              },
            },
            {
              $group: {
                _id: null,
                deliveredPOs: { $sum: 1 },
                avgLeadTimeDays: { $avg: '$leadTimeDays' },
                onTimeCount: {
                  $sum: { $cond: ['$isOnTime', 1, 0] },
                },
                lateCount: {
                  $sum: { $cond: ['$isOnTime', 0, 1] },
                },
              },
            },
          ],
          closedStats: [
            {
              $match: {
                status: {
                  $in: [PurchaseOrderStatus.DELIVERED, PurchaseOrderStatus.CLOSED],
                },
              },
            },
            {
              $group: {
                _id: null,
                avgOrderValue: { $avg: '$totalCost' },
              },
            },
          ],
        },
      },
    ]);

    const overview = result?.overview?.[0] || { totalPOs: 0, totalSpend: 0 };
    const delivered = result?.delivered?.[0] || {
      deliveredPOs: 0,
      avgLeadTimeDays: 0,
      onTimeCount: 0,
      lateCount: 0,
    };
    const closedStats = result?.closedStats?.[0] || { avgOrderValue: 0 };

    const onTimeDeliveryRate =
      delivered.deliveredPOs > 0
        ? Math.round((delivered.onTimeCount / delivered.deliveredPOs) * 100)
        : 0;

    return {
      totalPOs: overview.totalPOs,
      deliveredPOs: delivered.deliveredPOs,
      onTimeDeliveryRate,
      avgLeadTimeDays: Math.round(delivered.avgLeadTimeDays * 10) / 10,
      totalSpend: overview.totalSpend,
      avgOrderValue: Math.round(closedStats.avgOrderValue * 100) / 100,
      lateDeliveries: delivered.lateCount,
    };
  }
}
