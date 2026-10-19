import { Router } from 'express';
import { WarehouseController } from '../controllers/warehouse.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { UserRole } from '../types';
import {
  createWarehouseSchema,
  updateWarehouseSchema,
} from '../validators/warehouse.validator';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  requireRole(UserRole.ADMIN),
  validate(createWarehouseSchema),
  WarehouseController.createWarehouse
);

router.get(
  '/',
  requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.OPERATIONS_MANAGER),
  WarehouseController.getWarehouses
);

router.get(
  '/:id',
  requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.OPERATIONS_MANAGER),
  WarehouseController.getWarehouseById
);

router.put(
  '/:id',
  requireRole(UserRole.ADMIN),
  validate(updateWarehouseSchema),
  WarehouseController.updateWarehouse
);

router.delete(
  '/:id',
  requireRole(UserRole.ADMIN),
  WarehouseController.deleteWarehouse
);

export default router;
