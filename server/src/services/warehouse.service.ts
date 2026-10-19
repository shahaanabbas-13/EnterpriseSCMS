import { Warehouse, IWarehouseDocument } from '../models/Warehouse.model';
import { Product } from '../models/Product.model';
import { ApiError } from '../utils/ApiError';
import { PaginationQuery, PaginatedResult } from '../types';
import { PAGINATION } from '../utils/constants';
import { logger } from '../utils/logger';

/**
 * Warehouse service.
 * Handles warehouse CRUD and capacity management.
 */
export class WarehouseService {
  static async createWarehouse(data: {
    name: string;
    code: string;
    location: {
      address: string;
      city: string;
      state: string;
      country: string;
      zipCode?: string;
    };
    managerId: string;
    capacity: number;
  }): Promise<IWarehouseDocument> {
    const existingCode = await Warehouse.findOne({ code: data.code.toUpperCase() });
    if (existingCode) {
      throw ApiError.conflict(`Warehouse with code ${data.code} already exists`);
    }

    const warehouse = await Warehouse.create({
      ...data,
      code: data.code.toUpperCase(),
    });

    logger.info(`Warehouse created: ${warehouse.code} - ${warehouse.name}`);
    return warehouse;
  }

  static async getWarehouses(
    filters: { isActive?: boolean; managerId?: string },
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<IWarehouseDocument>> {
    const {
      page = PAGINATION.DEFAULT_PAGE,
      limit = PAGINATION.DEFAULT_LIMIT,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = pagination;

    const query: Record<string, unknown> = {};
    if (filters.isActive !== undefined) query.isActive = filters.isActive;
    if (filters.managerId) query.managerId = filters.managerId;

    const skip = (page - 1) * limit;
    const sortDirection = sortOrder === 'asc' ? 1 : -1;

    const [data, total] = await Promise.all([
      Warehouse.find(query)
        .sort({ [sortBy]: sortDirection })
        .skip(skip)
        .limit(limit)
        .populate('managerId', 'name email')
        .lean(),
      Warehouse.countDocuments(query),
    ]);

    return {
      data: data as IWarehouseDocument[],
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  static async getWarehouseById(warehouseId: string): Promise<IWarehouseDocument> {
    const warehouse = await Warehouse.findById(warehouseId)
      .populate('managerId', 'name email role');

    if (!warehouse) throw ApiError.notFound('Warehouse not found');
    return warehouse;
  }

  static async updateWarehouse(
    warehouseId: string,
    updates: Partial<{
      name: string;
      location: {
        address: string;
        city: string;
        state: string;
        country: string;
        zipCode?: string;
      };
      managerId: string;
      capacity: number;
      isActive: boolean;
    }>
  ): Promise<IWarehouseDocument> {
    const warehouse = await Warehouse.findByIdAndUpdate(
      warehouseId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!warehouse) throw ApiError.notFound('Warehouse not found');
    logger.info(`Warehouse updated: ${warehouse.code}`);
    return warehouse;
  }

  static async deleteWarehouse(warehouseId: string): Promise<void> {
    const warehouse = await Warehouse.findById(warehouseId);
    if (!warehouse) throw ApiError.notFound('Warehouse not found');

    const productCount = await Product.countDocuments({ warehouseId });
    if (productCount > 0) {
      throw ApiError.badRequest(
        `Cannot delete warehouse with ${productCount} products. Reassign or remove products first.`
      );
    }

    await Warehouse.findByIdAndDelete(warehouseId);
    logger.info(`Warehouse deleted: ${warehouse.code}`);
  }
}
