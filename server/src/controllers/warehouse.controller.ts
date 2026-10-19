import { Response } from "express";
import { WarehouseService } from "../services/warehouse.service";
import { AuditService } from "../services/audit.service";
import { ApiResponse } from "../utils/ApiResponse";
import { AuthRequest, AuditAction } from "../types";
import { str, strOrUndefined, numOrUndefined } from "../utils/express-helpers";

/**
 * Warehouse controller.
 * Handles HTTP layer for warehouse management.
 */
export class WarehouseController {
  static async createWarehouse(req: AuthRequest, res: Response): Promise<void> {
    const warehouse = await WarehouseService.createWarehouse(req.body);

    await AuditService.log({
      userId: req.user!.userId,
      action: AuditAction.CREATE,
      entity: "Warehouse",
      entityId: warehouse._id.toString(),
      newValue: { code: warehouse.code, name: warehouse.name },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    ApiResponse.created(res, warehouse, "Warehouse created");
  }

  static async getWarehouses(req: AuthRequest, res: Response): Promise<void> {
    const result = await WarehouseService.getWarehouses(
      {
        isActive:
          req.query.isActive === "true"
            ? true
            : req.query.isActive === "false"
              ? false
              : undefined,
        managerId: strOrUndefined(req.query.managerId),
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
      "Warehouses retrieved",
    );
  }

  static async getWarehouseById(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    const warehouse = await WarehouseService.getWarehouseById(
      str(req.params.id),
    );
    ApiResponse.success(res, warehouse, "Warehouse retrieved");
  }

  static async updateWarehouse(req: AuthRequest, res: Response): Promise<void> {
    const warehouse = await WarehouseService.updateWarehouse(
      str(req.params.id),
      req.body,
    );

    await AuditService.log({
      userId: req.user!.userId,
      action: AuditAction.UPDATE,
      entity: "Warehouse",
      entityId: warehouse._id.toString(),
      newValue: req.body,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    ApiResponse.success(res, warehouse, "Warehouse updated");
  }

  static async deleteWarehouse(req: AuthRequest, res: Response): Promise<void> {
    const id = str(req.params.id);
    await WarehouseService.deleteWarehouse(id);

    await AuditService.log({
      userId: req.user!.userId,
      action: AuditAction.DELETE,
      entity: "Warehouse",
      entityId: id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    ApiResponse.success(res, null, "Warehouse deleted");
  }
}
