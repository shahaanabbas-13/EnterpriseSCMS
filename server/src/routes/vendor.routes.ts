import { Router } from 'express';
import { VendorController } from '../controllers/vendor.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { UserRole } from '../types';
import {
  createVendorSchema,
  updateVendorSchema,
  createPurchaseOrderSchema,
  updatePOStatusSchema,
  receivePurchaseOrderSchema,
} from '../validators/vendor.validator';

const router = Router();

router.use(authenticate);

// ─── Vendor CRUD ────────────────────────────────────────────────────────
router.post(
  '/',
  requireRole(UserRole.ADMIN),
  validate(createVendorSchema),
  VendorController.createVendor
);

router.get(
  '/',
  requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.OPERATIONS_MANAGER),
  VendorController.getVendors
);

// Register static paths before /:id so "purchase-orders" is not parsed as a vendor ID.
router.post(
  '/purchase-orders',
  requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER),
  validate(createPurchaseOrderSchema),
  VendorController.createPurchaseOrder
);

router.get(
  '/purchase-orders',
  requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.VENDOR, UserRole.OPERATIONS_MANAGER),
  VendorController.getPurchaseOrders
);

router.get(
  '/purchase-orders/:id',
  requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.VENDOR, UserRole.OPERATIONS_MANAGER),
  VendorController.getPurchaseOrderById
);

router.patch(
  '/purchase-orders/:id/status',
  requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.VENDOR),
  validate(updatePOStatusSchema),
  VendorController.updatePurchaseOrderStatus
);

router.post(
  '/purchase-orders/:id/receipts',
  requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER),
  validate(receivePurchaseOrderSchema),
  VendorController.receivePurchaseOrder
);

router.get(
  '/:id',
  requireRole(UserRole.ADMIN, UserRole.OPERATIONS_MANAGER),
  VendorController.getVendorById
);

router.put(
  '/:id',
  requireRole(UserRole.ADMIN),
  validate(updateVendorSchema),
  VendorController.updateVendor
);

router.delete(
  '/:id',
  requireRole(UserRole.ADMIN),
  VendorController.deleteVendor
);

router.get(
  '/:id/performance',
  requireRole(UserRole.ADMIN, UserRole.OPERATIONS_MANAGER),
  VendorController.getVendorPerformance
);

export default router;
