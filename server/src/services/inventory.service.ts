import mongoose from 'mongoose';
import { Product, IProductDocument } from '../models/Product.model';
import { StockMovement, IStockMovementDocument } from '../models/StockMovement.model';
import { Warehouse } from '../models/Warehouse.model';
import { Vendor } from '../models/Vendor.model';
import { ApiError } from '../utils/ApiError';
import { StockMovementType, PaginationQuery, PaginatedResult, AppEvents, VendorStatus } from '../types';
import { appEvents } from '../events';
import { PAGINATION } from '../utils/constants';
import { logger } from '../utils/logger';

/**
 * Inventory service.
 * Handles all product CRUD, stock operations, and inventory analytics.
 *
 * KEY DESIGN: Stock is event-sourced.
 * - currentStock on Product is a denormalized cache
 * - The source of truth is the StockMovement collection
 * - Every stock change creates a StockMovement record first, then updates Product
 * - This gives us full audit trail + ability to recompute stock from history
 */
export class InventoryService {
  // ─── Product CRUD ─────────────────────────────────────────

  static async createProduct(data: {
    sku: string;
    name: string;
    description?: string;
    category: string;
    unit: string;
    price: number;
    costPrice: number;
    reorderPoint?: number;
    warehouseId: string;
    vendorId?: string;
    tags?: string[];
  }): Promise<IProductDocument> {
    // Verify warehouse exists
    const warehouse = await Warehouse.findById(data.warehouseId);
    if (!warehouse) {
      throw ApiError.notFound('Warehouse not found');
    }

    // Check for duplicate SKU
    const existingSku = await Product.findOne({ sku: data.sku.toUpperCase() });
    if (existingSku) {
      throw ApiError.conflict(`Product with SKU ${data.sku} already exists`);
    }

    const product = await Product.create({
      ...data,
      sku: data.sku.toUpperCase(),
      currentStock: 0, // Always starts at 0; stock added via StockMovement
    });

    logger.info(`Product created: ${product.sku} - ${product.name}`);
    return product;
  }

  static async getProducts(
    filters: {
      category?: string;
      warehouseId?: string;
      isActive?: boolean;
      lowStock?: boolean;
      search?: string;
    },
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<IProductDocument>> {
    const {
      page = PAGINATION.DEFAULT_PAGE,
      limit = PAGINATION.DEFAULT_LIMIT,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = pagination;

    const query: Record<string, unknown> = {};
    if (filters.category) query.category = filters.category;
    if (filters.warehouseId) query.warehouseId = filters.warehouseId;
    if (filters.isActive !== undefined) query.isActive = filters.isActive;
    if (filters.lowStock) {
      query.$expr = { $lte: ['$currentStock', '$reorderPoint'] };
    }
    if (filters.search) {
      query.$text = { $search: filters.search };
    }

    const skip = (page - 1) * limit;
    const sortDirection = sortOrder === 'asc' ? 1 : -1;

    const [data, total] = await Promise.all([
      Product.find(query)
        .sort({ [sortBy]: sortDirection })
        .skip(skip)
        .limit(limit)
        .populate('warehouseId', 'name code')
        .populate('vendorId', 'name')
        .lean(),
      Product.countDocuments(query),
    ]);

    return {
      data: data as IProductDocument[],
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  static async getProductById(productId: string): Promise<IProductDocument> {
    const product = await Product.findById(productId)
      .populate('warehouseId', 'name code location')
      .populate('vendorId', 'name');

    if (!product) throw ApiError.notFound('Product not found');
    return product;
  }

  static async updateProduct(
    productId: string,
    updates: Partial<{
      name: string;
      description: string;
      category: string;
      unit: string;
      price: number;
      costPrice: number;
      reorderPoint: number;
      warehouseId: string;
      vendorId: string;
      isActive: boolean;
      tags: string[];
    }>
  ): Promise<IProductDocument> {
    if (updates.vendorId) {
      const vendor = await Vendor.findById(updates.vendorId).select('status');
      if (!vendor) throw ApiError.notFound('Vendor not found');
      if (vendor.status !== VendorStatus.ACTIVE) throw ApiError.badRequest('Select an active vendor for this product');
    }
    const product = await Product.findByIdAndUpdate(
      productId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!product) throw ApiError.notFound('Product not found');

    // Check if reorderPoint changed — might trigger low-stock alert
    if (updates.reorderPoint !== undefined) {
      await this.checkLowStock(product);
    }

    logger.info(`Product updated: ${product.sku}`);
    return product;
  }

  static async deleteProduct(productId: string): Promise<void> {
    const product = await Product.findById(productId);
    if (!product) throw ApiError.notFound('Product not found');

    if (product.currentStock > 0) {
      throw ApiError.badRequest(
        'Cannot delete product with existing stock. Adjust stock to 0 first.'
      );
    }

    await Product.findByIdAndDelete(productId);
    logger.info(`Product deleted: ${product.sku}`);
  }

  // ─── Stock Operations (Event-Sourced) ─────────────────────

  /**
   * Record a stock movement and update product stock.
   * This is THE core function — all stock changes go through here.
   *
   * Uses MongoDB transactions for atomicity:
   * 1. Read current stock
   * 2. Validate the operation
   * 3. Create StockMovement record
   * 4. Update Product.currentStock
   * All within a single transaction — either all succeed or none.
   */
  static async recordStockMovement(data: {
    productId: string;
    type: StockMovementType;
    quantity: number;
    reason: string;
    performedBy: string;
    referenceType?: string;
    referenceId?: string;
  }): Promise<{ movement: IStockMovementDocument; product: IProductDocument }> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const product = await Product.findById(data.productId).session(session);
      if (!product) throw ApiError.notFound('Product not found');

      const previousStock = product.currentStock;
      let quantityChange: number;

      switch (data.type) {
        case StockMovementType.IN:
          quantityChange = Math.abs(data.quantity);
          break;
        case StockMovementType.OUT:
          quantityChange = -Math.abs(data.quantity);
          if (previousStock + quantityChange < 0) {
            throw ApiError.badRequest(
              `Insufficient stock. Available: ${previousStock}, Requested: ${Math.abs(data.quantity)}`
            );
          }
          break;
        case StockMovementType.ADJUSTMENT:
          quantityChange = data.quantity;
          if (previousStock + quantityChange < 0) {
            throw ApiError.badRequest(
              `Adjustment would result in negative stock. Current: ${previousStock}, Adjustment: ${data.quantity}`
            );
          }
          break;
        default:
          throw ApiError.badRequest('Invalid stock movement type');
      }

      const newStock = previousStock + quantityChange;

      // Create stock movement record
      const [movement] = await StockMovement.create(
        [
          {
            productId: product._id,
            warehouseId: product.warehouseId,
            type: data.type,
            quantity: quantityChange,
            previousStock,
            newStock,
            reason: data.reason,
            referenceType: data.referenceType || 'Manual',
            referenceId: data.referenceId
              ? new mongoose.Types.ObjectId(data.referenceId)
              : undefined,
            performedBy: new mongoose.Types.ObjectId(data.performedBy),
            timestamp: new Date(),
          },
        ],
        { session }
      );

      // Update product stock
      product.currentStock = newStock;
      await product.save({ session });

      await session.commitTransaction();

      // Emit events AFTER successful transaction
      appEvents.emitEvent(AppEvents.STOCK_CHANGED, {
        productId: product._id,
        sku: product.sku,
        previousStock,
        newStock,
        movementType: data.type,
        quantity: quantityChange,
      });

      // Check for low stock
      await this.checkLowStock(product);

      logger.info(
        `Stock ${data.type}: ${product.sku} | ${previousStock} \u2192 ${newStock} (${quantityChange > 0 ? '+' : ''}${quantityChange})`
      );

      return { movement, product };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Get stock movement history with pagination and filters.
   */
  static async getStockMovements(
    filters: {
      productId?: string;
      warehouseId?: string;
      type?: StockMovementType;
      startDate?: Date;
      endDate?: Date;
    },
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<IStockMovementDocument>> {
    const { page = PAGINATION.DEFAULT_PAGE, limit = PAGINATION.DEFAULT_LIMIT } = pagination;

    const query: Record<string, unknown> = {};
    if (filters.productId) query.productId = filters.productId;
    if (filters.warehouseId) query.warehouseId = filters.warehouseId;
    if (filters.type) query.type = filters.type;

    if (filters.startDate || filters.endDate) {
      const timestampFilter: Record<string, Date> = {};
      if (filters.startDate) timestampFilter.$gte = filters.startDate;
      if (filters.endDate) timestampFilter.$lte = filters.endDate;
      query.timestamp = timestampFilter;
    }

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      StockMovement.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .populate('productId', 'sku name')
        .populate('performedBy', 'name email')
        .populate('warehouseId', 'name code')
        .lean(),
      StockMovement.countDocuments(query),
    ]);

    return {
      data: data as IStockMovementDocument[],
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  // ─── Stock Analytics (MongoDB Aggregation Pipelines) ──────

  /**
   * Get stock value grouped by category.
   * Uses $group + $multiply aggregation.
   */
  static async getStockValueByCategory(): Promise<
    Array<{ _id: string; totalValue: number; totalItems: number; productCount: number }>
  > {
    return Product.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$category',
          totalValue: { $sum: { $multiply: ['$currentStock', '$costPrice'] } },
          totalItems: { $sum: '$currentStock' },
          productCount: { $sum: 1 },
        },
      },
      { $sort: { totalValue: -1 } },
    ]);
  }

  /**
   * Get all products below their reorder point.
   */
  static async getLowStockProducts(): Promise<IProductDocument[]> {
    return Product.find({
      isActive: true,
      $expr: { $lte: ['$currentStock', '$reorderPoint'] },
    })
      .populate('warehouseId', 'name code')
      .sort({ currentStock: 1 })
      .lean() as Promise<IProductDocument[]>;
  }

  /**
   * Build a transparent, 90-day moving-average replenishment baseline.
   * This intentionally avoids calling the estimate an ML prediction: the
   * calculation is explainable and gives us a baseline for later evaluation.
   */
  static async getReplenishmentPlan(): Promise<Array<Record<string, unknown>>> {
    const windowDays = 90;
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const [products, demandRows] = await Promise.all([
      Product.find({ isActive: true })
        .populate('warehouseId', 'name code')
        .populate('vendorId', 'name code leadTimeDays')
        .sort({ currentStock: 1, name: 1 })
        .lean(),
      StockMovement.aggregate([
        { $match: { type: StockMovementType.OUT, timestamp: { $gte: since } } },
        { $group: { _id: '$productId', demandUnits: { $sum: { $abs: '$quantity' } } } },
      ]),
    ]);
    const demandByProduct = new Map<string, number>(
      demandRows.map(row => [String(row._id), Number(row.demandUnits) || 0])
    );

    const plan = products.map(product => {
      const demandUnits90d = demandByProduct.get(String(product._id)) || 0;
      const averageDailyDemand = demandUnits90d / windowDays;
      const vendor = product.vendorId as unknown as { _id: unknown; name: string; code: string; leadTimeDays?: number } | null;
      const leadTimeDays = Math.max(0, Number(vendor?.leadTimeDays) || 0);
      const projectedDaysRemaining = averageDailyDemand > 0
        ? Math.floor(product.currentStock / averageDailyDemand)
        : null;
      const targetStock = Math.max(
        product.reorderPoint,
        Math.ceil(averageDailyDemand * (leadTimeDays + 30))
      );
      const recommendedOrderQty = Math.max(0, targetStock - product.currentStock);
      const risk = product.currentStock <= 0
        ? 'OUT_OF_STOCK'
        : projectedDaysRemaining !== null && projectedDaysRemaining <= leadTimeDays
          ? 'CRITICAL'
          : product.currentStock <= product.reorderPoint || (projectedDaysRemaining !== null && projectedDaysRemaining <= leadTimeDays + 14)
            ? 'REORDER'
            : 'HEALTHY';

      return {
        _id: product._id,
        sku: product.sku,
        name: product.name,
        category: product.category,
        unit: product.unit,
        currentStock: product.currentStock,
        reorderPoint: product.reorderPoint,
        demandUnits90d,
        averageDailyDemand: Math.round(averageDailyDemand * 100) / 100,
        projectedDaysRemaining,
        leadTimeDays,
        recommendedOrderQty,
        risk,
        warehouse: product.warehouseId,
        vendor: vendor ? { _id: vendor._id, name: vendor.name, code: vendor.code } : null,
      };
    });
    const priority: Record<string, number> = { OUT_OF_STOCK: 0, CRITICAL: 1, REORDER: 2, HEALTHY: 3 };
    return plan.sort((a, b) => priority[String(a.risk)] - priority[String(b.risk)] || Number(a.projectedDaysRemaining ?? Infinity) - Number(b.projectedDaysRemaining ?? Infinity));
  }

  /**
   * Get inventory summary for a specific warehouse.
   * Uses $facet for parallel aggregation pipelines.
   */
  static async getWarehouseSummary(warehouseId: string): Promise<{
    totalProducts: number;
    totalStockValue: number;
    lowStockCount: number;
    outOfStockCount: number;
    categoryBreakdown: Array<{ category: string; count: number; value: number }>;
  }> {
    const warehouseObjectId = new mongoose.Types.ObjectId(warehouseId);

    const [summary] = await Product.aggregate([
      { $match: { warehouseId: warehouseObjectId, isActive: true } },
      {
        $facet: {
          overview: [
            {
              $group: {
                _id: null,
                totalProducts: { $sum: 1 },
                totalStockValue: {
                  $sum: { $multiply: ['$currentStock', '$costPrice'] },
                },
                lowStockCount: {
                  $sum: {
                    $cond: [{ $lte: ['$currentStock', '$reorderPoint'] }, 1, 0],
                  },
                },
                outOfStockCount: {
                  $sum: { $cond: [{ $eq: ['$currentStock', 0] }, 1, 0] },
                },
              },
            },
          ],
          categoryBreakdown: [
            {
              $group: {
                _id: '$category',
                count: { $sum: 1 },
                value: { $sum: { $multiply: ['$currentStock', '$costPrice'] } },
              },
            },
            { $project: { category: '$_id', count: 1, value: 1, _id: 0 } },
            { $sort: { value: -1 } },
          ],
        },
      },
    ]);

    const overview = summary?.overview?.[0] || {
      totalProducts: 0,
      totalStockValue: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
    };

    return {
      ...overview,
      categoryBreakdown: summary?.categoryBreakdown || [],
    };
  }

  // ─── Private Helpers ──────────────────────────────────────

  static async checkLowStock(product: IProductDocument): Promise<void> {
    if (product.currentStock <= product.reorderPoint) {
      appEvents.emitEvent(AppEvents.LOW_STOCK_DETECTED, {
        productId: product._id,
        sku: product.sku,
        name: product.name,
        currentStock: product.currentStock,
        reorderPoint: product.reorderPoint,
        warehouseId: product.warehouseId,
      });

      logger.warn(
        `Low stock alert: ${product.sku} has ${product.currentStock} units (reorder at ${product.reorderPoint})`
      );
    }
  }
}
