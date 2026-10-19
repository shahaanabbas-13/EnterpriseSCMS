import { Router } from 'express';
import { InventoryController } from '../controllers/inventory.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { UserRole } from '../types';
import {
  createProductSchema,
  updateProductSchema,
  stockMovementSchema,
} from '../validators/inventory.validator';

const router = Router();

// All inventory routes require authentication
router.use(authenticate);

// ─── Product Routes ────────────────────────────────────────────────────────────
router.post(
  '/products',
  requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER),
  validate(createProductSchema),
  InventoryController.createProduct
);

router.get(
  '/products',
  requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.OPERATIONS_MANAGER),
  InventoryController.getProducts
);

router.get(
  '/products/:id',
  requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.OPERATIONS_MANAGER),
  InventoryController.getProductById
);

router.put(
  '/products/:id',
  requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER),
  validate(updateProductSchema),
  InventoryController.updateProduct
);

router.delete(
  '/products/:id',
  requireRole(UserRole.ADMIN),
  InventoryController.deleteProduct
);

// ─── Stock Movement Routes ─────────────────────────────────────────────────────
router.post(
  '/stock-movements',
  requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER),
  validate(stockMovementSchema),
  InventoryController.recordStockMovement
);

router.get(
  '/stock-movements',
  requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.OPERATIONS_MANAGER),
  InventoryController.getStockMovements
);

// ─── Analytics Routes ──────────────────────────────────────────────────────────
router.get(
  '/analytics/stock-value',
  requireRole(UserRole.ADMIN, UserRole.OPERATIONS_MANAGER),
  InventoryController.getStockValueByCategory
);

router.get(
  '/analytics/low-stock',
  requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.OPERATIONS_MANAGER),
  InventoryController.getLowStockProducts
);

router.get(
  '/analytics/warehouse/:warehouseId',
  requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.OPERATIONS_MANAGER),
  InventoryController.getWarehouseSummary
);

export default router;
