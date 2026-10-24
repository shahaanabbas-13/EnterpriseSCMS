import mongoose from 'mongoose';
import { Vendor, IVendorDocument } from '../models/Vendor.model';
import { Product } from '../models/Product.model';
import { Warehouse } from '../models/Warehouse.model';
import { StockMovement } from '../models/StockMovement.model';
import { InventoryService } from './inventory.service';
import {
  PurchaseOrder,
  IPurchaseOrderDocument,
} from '../models/PurchaseOrder.model';
import { ApiError } from '../utils/ApiError';
import {
  VendorStatus,
  PurchaseOrderStatus,
  StockMovementType,
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
  static async respondToPurchaseOrder(
    poId: string,
    actorId: string,
    input: { response: 'ACKNOWLEDGED' | 'REJECTED'; note?: string; proposedDeliveryDate?: Date }
  ): Promise<{ po: IPurchaseOrderDocument; previousStatus: PurchaseOrderStatus }> {
    const po = await PurchaseOrder.findById(poId);
    if (!po) throw ApiError.notFound('Purchase order not found');
    if (po.status !== PurchaseOrderStatus.SENT) throw ApiError.badRequest(`A supplier response can only be recorded for a SENT purchase order (current status: ${po.status})`);
    if (input.proposedDeliveryDate && input.proposedDeliveryDate.getTime() < new Date().setHours(0, 0, 0, 0)) {
      throw ApiError.badRequest('Proposed delivery date cannot be in the past');
    }
    const previousStatus = po.status;
    po.vendorResponse = { ...input, respondedAt: new Date() };
    if (input.response === 'ACKNOWLEDGED') po.status = PurchaseOrderStatus.ACKNOWLEDGED;
    else po.status = PurchaseOrderStatus.REJECTED;
    po.statusHistory.push({ fromStatus: previousStatus, toStatus: po.status, changedBy: new mongoose.Types.ObjectId(actorId), timestamp: new Date(), note: input.note || `Supplier ${input.response.toLowerCase()} the order` } as never);
    await po.save();
    logger.info(`PO ${po.poNumber}: vendor response ${input.response}`);
    return { po, previousStatus };
  }

  static async recordVendorDispatch(
    poId: string,
    actorId: string,
    input: { carrier: string; trackingNumber: string; dispatchedAt: Date; note?: string }
  ): Promise<IPurchaseOrderDocument> {
    const po = await PurchaseOrder.findById(poId);
    if (!po) throw ApiError.notFound('Purchase order not found');
    if (![PurchaseOrderStatus.ACKNOWLEDGED, PurchaseOrderStatus.PARTIALLY_RECEIVED].includes(po.status)) {
      throw ApiError.badRequest(`Dispatch details can only be recorded for acknowledged orders that are not fully received (current status: ${po.status})`);
    }
    if (input.dispatchedAt.getTime() > Date.now() + 5 * 60 * 1000) throw ApiError.badRequest('Dispatch date cannot be in the future');
    if (input.dispatchedAt.getTime() < po.createdAt.getTime()) throw ApiError.badRequest('Dispatch date cannot be earlier than the purchase order date');
    po.dispatchHistory.push({ ...input, recordedAt: new Date(), recordedBy: new mongoose.Types.ObjectId(actorId) } as never);
    po.dispatchDetails = input;
    await po.save();
    logger.info(`PO ${po.poNumber}: dispatch recorded with ${input.carrier} (${input.trackingNumber})`);
    return po;
  }

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
  ): Promise<PaginatedResult<IVendorDocument & { rating: number | null }>> {
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

    const completedDeliveryScores = data.length ? await PurchaseOrder.aggregate([
      { $match: { vendorId: { $in: data.map((vendor) => vendor._id) }, status: { $in: [PurchaseOrderStatus.DELIVERED, PurchaseOrderStatus.CLOSED] }, actualDeliveryDate: { $exists: true } } },
      { $group: { _id: '$vendorId', deliveredCount: { $sum: 1 }, onTimeCount: { $sum: { $cond: [{ $lte: ['$actualDeliveryDate', '$expectedDeliveryDate'] }, 1, 0] } } } },
    ]) : [];
    const scoreByVendor = new Map(completedDeliveryScores.map((score) => [score._id.toString(), score.deliveredCount > 0 ? Math.round((score.onTimeCount / score.deliveredCount) * 50) / 10 : null]));

    return {
      data: data.map((vendor) => ({ ...vendor, rating: scoreByVendor.get(vendor._id.toString()) ?? null })) as unknown as Array<IVendorDocument & { rating: number | null }>,
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
      status: { $nin: [PurchaseOrderStatus.CLOSED, PurchaseOrderStatus.DELIVERED, PurchaseOrderStatus.REJECTED] },
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

    if (!mongoose.isValidObjectId(data.warehouseId)) throw ApiError.badRequest('A valid destination warehouse is required');
    const warehouse = await Warehouse.findOne({ _id: data.warehouseId, isActive: true }).select('_id');
    if (!warehouse) throw ApiError.badRequest('Select an active destination warehouse');

    const productIds = [...new Set(data.items.map(item => item.productId))];
    if (productIds.some(id => !mongoose.isValidObjectId(id))) throw ApiError.badRequest('Purchase order contains an invalid product');
    const products = await Product.find({ _id: { $in: productIds }, isActive: true }).select('name sku costPrice warehouseId');
    const productsById = new Map(products.map(product => [product._id.toString(), product]));
    for (const item of data.items) {
      const product = productsById.get(item.productId);
      if (!product) throw ApiError.badRequest(`Product ${item.productId} is unavailable`);
      if (product.warehouseId.toString() !== data.warehouseId) {
        throw ApiError.badRequest(`Product ${product.sku} is assigned to a different warehouse. Choose the product's warehouse or assign the product first.`);
      }
    }

    // Calculate line totals and grand total
    const items = data.items.map((item) => {
      const product = productsById.get(item.productId)!;
      return {
        ...item,
        productName: product.name,
        sku: product.sku,
        unitPrice: product.costPrice,
        productId: new mongoose.Types.ObjectId(item.productId),
        totalPrice: item.quantity * product.costPrice,
      };
    });
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
      statusHistory: [{ toStatus: PurchaseOrderStatus.DRAFT, changedBy: data.createdBy, timestamp: new Date(), note: 'Purchase order created' }],
    });

    logger.info(`Purchase order created: ${po.poNumber} for vendor ${vendor.code}`);
    return po;
  }

  static async correctPurchaseOrderWarehouse(poId: string, warehouseId: string): Promise<{ po: IPurchaseOrderDocument; previousWarehouseId: string }> {
    if (!mongoose.isValidObjectId(warehouseId)) throw ApiError.badRequest('Select a valid destination warehouse');
    const po = await PurchaseOrder.findById(poId);
    if (!po) throw ApiError.notFound('Purchase order not found');
    if (po.receiptHistory.length || po.items.some(item => (item.receivedQuantity || 0) > 0)) {
      throw ApiError.badRequest('Destination cannot be changed after any items have been received');
    }
    if ([PurchaseOrderStatus.DELIVERED, PurchaseOrderStatus.CLOSED].includes(po.status)) {
      throw ApiError.badRequest(`Destination cannot be changed while purchase order is ${po.status}`);
    }
    const warehouse = await Warehouse.findOne({ _id: warehouseId, isActive: true }).select('_id');
    if (!warehouse) throw ApiError.badRequest('Select an active destination warehouse');
    const products = await Product.find({ _id: { $in: po.items.map(item => item.productId) }, isActive: true }).select('sku warehouseId');
    const productsById = new Map(products.map(product => [product._id.toString(), product]));
    for (const item of po.items) {
      const product = productsById.get(item.productId.toString());
      if (!product) throw ApiError.badRequest(`Product ${item.sku} is unavailable`);
      if (product.warehouseId.toString() !== warehouseId) {
        throw ApiError.badRequest(`Product ${item.sku} is assigned to another warehouse. The PO destination must match every product line.`);
      }
    }
    const previousWarehouseId = po.warehouseId.toString();
    po.warehouseId = new mongoose.Types.ObjectId(warehouseId);
    await po.save();
    logger.info(`PO ${po.poNumber}: destination corrected ${previousWarehouseId} → ${warehouseId}`);
    return { po, previousWarehouseId };
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
   * Enforced lifecycle: DRAFT → SENT → ACKNOWLEDGED → (receipt) → DELIVERED → CLOSED
   */
  static async updatePurchaseOrderStatus(
    poId: string,
    newStatus: PurchaseOrderStatus,
    actorId: string
  ): Promise<{ po: IPurchaseOrderDocument; previousStatus: PurchaseOrderStatus }> {
    const session = await mongoose.startSession();
    let po: IPurchaseOrderDocument | null = null;
    let previousStatus: PurchaseOrderStatus | undefined;
    let receivedProducts: Array<{ product: InstanceType<typeof Product>; previousStock: number; newStock: number; quantity: number }> = [];
    session.startTransaction();

    try {
      po = await PurchaseOrder.findById(poId).session(session);
      if (!po) throw ApiError.notFound('Purchase order not found');

      const validTransitions: Record<string, PurchaseOrderStatus[]> = {
        [PurchaseOrderStatus.DRAFT]: [PurchaseOrderStatus.SENT],
        [PurchaseOrderStatus.SENT]: [PurchaseOrderStatus.ACKNOWLEDGED],
        [PurchaseOrderStatus.ACKNOWLEDGED]: [],
        [PurchaseOrderStatus.PARTIALLY_RECEIVED]: [],
        [PurchaseOrderStatus.REJECTED]: [],
        [PurchaseOrderStatus.DELIVERED]: [PurchaseOrderStatus.CLOSED],
        [PurchaseOrderStatus.CLOSED]: [],
      };
      const allowed = validTransitions[po.status] || [];
      if (!allowed.includes(newStatus)) {
        throw ApiError.badRequest(
          `Cannot transition PO from ${po.status} to ${newStatus}. Allowed: ${allowed.join(', ') || 'none'}`
        );
      }
      previousStatus = po.status;

      if (newStatus === PurchaseOrderStatus.SENT) {
        po.approvedBy = new mongoose.Types.ObjectId(actorId);
      }
      po.status = newStatus;
      po.statusHistory.push({ fromStatus: previousStatus, toStatus: newStatus, changedBy: new mongoose.Types.ObjectId(actorId), timestamp: new Date() } as never);
      await po.save({ session });
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }

    if (!po) throw ApiError.notFound('Purchase order not found');

    // Publish stock and low-stock events only after the transaction commits.
    for (const { product, previousStock, newStock, quantity } of receivedProducts) {
      appEvents.emitEvent(AppEvents.STOCK_CHANGED, {
        productId: product._id,
        sku: product.sku,
        previousStock,
        newStock,
        movementType: StockMovementType.IN,
        quantity,
      });
      await InventoryService.checkLowStock(product);
    }

    logger.info(`PO ${po.poNumber}: ${previousStatus || 'unknown'} → ${newStatus}`);
    return { po, previousStatus: previousStatus! };
  }

  /** Receive only the quantities physically checked in; stock, movements and PO receipt state commit together. */
  static async receivePurchaseOrder(
    poId: string,
    actorId: string,
    input: { items: Array<{ productId: string; quantity: number }>; note?: string }
  ): Promise<{ po: IPurchaseOrderDocument; previousStatus: PurchaseOrderStatus }> {
    const session = await mongoose.startSession();
    let po: IPurchaseOrderDocument | null = null;
    let previousStatus!: PurchaseOrderStatus;
    const receivedProducts: Array<{ product: InstanceType<typeof Product>; previousStock: number; newStock: number; quantity: number }> = [];
    session.startTransaction();
    try {
      po = await PurchaseOrder.findById(poId).session(session);
      if (!po) throw ApiError.notFound('Purchase order not found');
      previousStatus = po.status;
      if (![PurchaseOrderStatus.ACKNOWLEDGED, PurchaseOrderStatus.PARTIALLY_RECEIVED].includes(po.status)) {
        throw ApiError.badRequest(`Cannot receive items while purchase order is ${po.status}`);
      }
      const seen = new Set<string>();
      const receiptLines: Array<{ productId: mongoose.Types.ObjectId; quantity: number }> = [];
      for (const inputLine of input.items) {
        if (seen.has(inputLine.productId)) throw ApiError.badRequest('Each product can appear only once per receipt');
        seen.add(inputLine.productId);
        const line = po.items.find((item) => item.productId.toString() === inputLine.productId);
        if (!line) throw ApiError.badRequest(`Product ${inputLine.productId} is not on this purchase order`);
        const alreadyReceived = line.receivedQuantity || 0;
        const outstanding = line.quantity - alreadyReceived;
        if (inputLine.quantity > outstanding) {
          throw ApiError.badRequest(`${line.sku}: received quantity exceeds outstanding quantity (${outstanding})`);
        }
        const product = await Product.findById(line.productId).session(session);
        if (!product) throw ApiError.notFound(`Product not found for PO line ${line.sku}`);
        if (product.warehouseId.toString() !== po.warehouseId.toString()) {
          throw ApiError.badRequest(`Product ${product.sku} is assigned to a different warehouse than purchase order ${po.poNumber}`);
        }
        const previousStock = product.currentStock;
        const newStock = previousStock + inputLine.quantity;
        await StockMovement.create([{
          productId: product._id, warehouseId: po.warehouseId, type: StockMovementType.IN,
          quantity: inputLine.quantity, previousStock, newStock,
          reason: `Purchase order receipt: ${po.poNumber}${input.note ? ` — ${input.note}` : ''}`,
          referenceType: 'PurchaseOrder', referenceId: po._id,
          performedBy: new mongoose.Types.ObjectId(actorId), timestamp: new Date(),
        }], { session });
        product.currentStock = newStock;
        await product.save({ session });
        line.receivedQuantity = alreadyReceived + inputLine.quantity;
        receiptLines.push({ productId: line.productId, quantity: inputLine.quantity });
        receivedProducts.push({ product, previousStock, newStock, quantity: inputLine.quantity });
      }
      po.receiptHistory.push({ receivedBy: new mongoose.Types.ObjectId(actorId), receivedAt: new Date(), note: input.note, items: receiptLines } as never);
      const previousStatusForHistory = po.status;
      const complete = po.items.every((line) => (line.receivedQuantity || 0) >= line.quantity);
      po.status = complete ? PurchaseOrderStatus.DELIVERED : PurchaseOrderStatus.PARTIALLY_RECEIVED;
      po.statusHistory.push({ fromStatus: previousStatusForHistory, toStatus: po.status, changedBy: new mongoose.Types.ObjectId(actorId), timestamp: new Date(), note: input.note || `${receiptLines.length} line(s) received` } as never);
      if (complete) po.actualDeliveryDate = new Date();
      await po.save({ session });
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
    if (!po) throw ApiError.notFound('Purchase order not found');
    for (const { product, previousStock, newStock, quantity } of receivedProducts) {
      appEvents.emitEvent(AppEvents.STOCK_CHANGED, { productId: product._id, sku: product.sku, previousStock, newStock, movementType: StockMovementType.IN, quantity });
      await InventoryService.checkLowStock(product);
    }
    if (po.status === PurchaseOrderStatus.DELIVERED) {
      appEvents.emitEvent(AppEvents.VENDOR_PERFORMANCE_UPDATE, { vendorId: po.vendorId, poId: po._id, expectedDeliveryDate: po.expectedDeliveryDate, actualDeliveryDate: po.actualDeliveryDate, totalCost: po.totalCost });
    }
    logger.info(`PO ${po.poNumber}: receipt recorded (${po.status})`);
    return { po, previousStatus };
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
    avgLeadTimeDays: number | null;
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
                status: { $in: [PurchaseOrderStatus.DELIVERED, PurchaseOrderStatus.CLOSED] },
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
      avgLeadTimeDays: delivered.deliveredPOs > 0 ? Math.round(delivered.avgLeadTimeDays * 10) / 10 : null,
      totalSpend: overview.totalSpend,
      avgOrderValue: Math.round(closedStats.avgOrderValue * 100) / 100,
      lateDeliveries: delivered.lateCount,
    };
  }
}
