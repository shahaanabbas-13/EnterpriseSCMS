import { Response } from "express";
import { InventoryService } from "../services/inventory.service";
import { AuditService } from "../services/audit.service";
import { ApiResponse } from "../utils/ApiResponse";
import { AuthRequest, AuditAction, StockMovementType } from "../types";
import { str, strOrUndefined, numOrUndefined } from "../utils/express-helpers";

/**
 * Inventory controller.
 * Handles HTTP layer for products, stock movements, and inventory analytics.
 */
export class InventoryController {
  // ─── Product Endpoints ─────────────────────────────────────────────────────────

  static async createProduct(req: AuthRequest, res: Response): Promise<void> {
    const product = await InventoryService.createProduct(req.body);

    await AuditService.log({
      userId: req.user!.userId,
      action: AuditAction.CREATE,
      entity: "Product",
      entityId: product._id.toString(),
      newValue: {
        sku: product.sku,
        name: product.name,
        category: product.category,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    ApiResponse.created(res, product, "Product created successfully");
  }

  static async getProducts(req: AuthRequest, res: Response): Promise<void> {
    const result = await InventoryService.getProducts(
      {
        category: strOrUndefined(req.query.category),
        warehouseId: strOrUndefined(req.query.warehouseId),
        isActive:
          req.query.isActive === "true"
            ? true
            : req.query.isActive === "false"
              ? false
              : undefined,
        lowStock: req.query.lowStock === "true",
        search: strOrUndefined(req.query.search),
      },
      {
        page: numOrUndefined(req.query.page),
        limit: numOrUndefined(req.query.limit),
        sortBy: strOrUndefined(req.query.sortBy),
        sortOrder: strOrUndefined(req.query.sortOrder) as
          | "asc"
          | "desc"
          | undefined,
      },
    );

    ApiResponse.paginated(
      res,
      result.data,
      result.pagination.total,
      result.pagination.page,
      result.pagination.limit,
      "Products retrieved",
    );
  }

  static async getProductById(req: AuthRequest, res: Response): Promise<void> {
    const product = await InventoryService.getProductById(str(req.params.id));
    ApiResponse.success(res, product, "Product retrieved");
  }

  static async updateProduct(req: AuthRequest, res: Response): Promise<void> {
    const product = await InventoryService.updateProduct(
      str(req.params.id),
      req.body,
    );

    await AuditService.log({
      userId: req.user!.userId,
      action: AuditAction.UPDATE,
      entity: "Product",
      entityId: product._id.toString(),
      newValue: req.body,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    ApiResponse.success(res, product, "Product updated");
  }

  static async deleteProduct(req: AuthRequest, res: Response): Promise<void> {
    const id = str(req.params.id);
    await InventoryService.deleteProduct(id);

    await AuditService.log({
      userId: req.user!.userId,
      action: AuditAction.DELETE,
      entity: "Product",
      entityId: id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    ApiResponse.success(res, null, "Product deleted");
  }

  // ─── Stock Movement Endpoints ──────────────────────────────────────────────────

  static async recordStockMovement(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    const { productId, type, quantity, reason, referenceType, referenceId } =
      req.body;

    const result = await InventoryService.recordStockMovement({
      productId,
      type,
      quantity,
      reason,
      performedBy: req.user!.userId,
      referenceType,
      referenceId,
    });

    await AuditService.log({
      userId: req.user!.userId,
      action: AuditAction.STOCK_UPDATED,
      entity: "Product",
      entityId: result.product._id.toString(),
      previousValue: { stock: result.movement.previousStock },
      newValue: {
        stock: result.movement.newStock,
        productName: result.product.name,
        sku: result.product.sku,
        movementType: type,
        quantity: Math.abs(result.movement.quantity),
        reason: result.movement.reason,
        movementId: result.movement._id.toString(),
        referenceType: result.movement.referenceType,
        referenceId: result.movement.referenceId?.toString(),
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    ApiResponse.created(res, result, "Stock movement recorded");
  }

  static async getStockMovements(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    const startDateStr = strOrUndefined(req.query.startDate);
    const endDateStr = strOrUndefined(req.query.endDate);

    const result = await InventoryService.getStockMovements(
      {
        productId: strOrUndefined(req.query.productId),
        warehouseId: strOrUndefined(req.query.warehouseId),
        type: strOrUndefined(req.query.type) as StockMovementType | undefined,
        startDate: startDateStr ? new Date(startDateStr) : undefined,
        endDate: endDateStr ? new Date(endDateStr) : undefined,
      },
      {
        page: numOrUndefined(req.query.page),
        limit: numOrUndefined(req.query.limit),
      },
    );

    ApiResponse.paginated(
      res,
      result.data,
      result.pagination.total,
      result.pagination.page,
      result.pagination.limit,
      "Stock movements retrieved",
    );
  }

  // ─── Analytics Endpoints ───────────────────────────────────────────────────────

  static async getStockValueByCategory(
    _req: AuthRequest,
    res: Response,
  ): Promise<void> {
    const data = await InventoryService.getStockValueByCategory();
    ApiResponse.success(res, data, "Stock value by category");
  }

  static async getLowStockProducts(
    _req: AuthRequest,
    res: Response,
  ): Promise<void> {
    const data = await InventoryService.getLowStockProducts();
    ApiResponse.success(res, data, "Low stock products");
  }

  static async getReplenishmentPlan(
    _req: AuthRequest,
    res: Response,
  ): Promise<void> {
    const data = await InventoryService.getReplenishmentPlan();
    ApiResponse.success(res, data, "Inventory replenishment plan");
  }

  static async getWarehouseSummary(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    const data = await InventoryService.getWarehouseSummary(
      str(req.params.warehouseId),
    );
    ApiResponse.success(res, data, "Warehouse inventory summary");
  }
}
