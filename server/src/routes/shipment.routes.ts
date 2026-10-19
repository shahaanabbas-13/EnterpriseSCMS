import { Router } from 'express';
import { ShipmentController } from '../controllers/shipment.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { UserRole } from '../types';
import {
  createShipmentSchema,
  updateShipmentStatusSchema,
  addCheckpointSchema,
} from '../validators/shipment.validator';

const router = Router();

router.use(authenticate);

// ─── Shipment CRUD ────────────────────────────────────────────────────────
router.post(
  '/',
  requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER),
  validate(createShipmentSchema),
  ShipmentController.createShipment
);

router.get(
  '/',
  requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.OPERATIONS_MANAGER),
  ShipmentController.getShipments
);

router.get(
  '/delayed',
  requireRole(UserRole.ADMIN, UserRole.OPERATIONS_MANAGER),
  ShipmentController.getDelayedShipments
);

router.get(
  '/stats',
  requireRole(UserRole.ADMIN, UserRole.OPERATIONS_MANAGER),
  ShipmentController.getShipmentStats
);

router.get(
  '/track/:trackingId',
  ShipmentController.trackShipment
);

router.get(
  '/:id',
  requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.OPERATIONS_MANAGER),
  ShipmentController.getShipmentById
);

// ─── Status & Checkpoints ───────────────────────────────────────────
router.patch(
  '/:id/status',
  requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER),
  validate(updateShipmentStatusSchema),
  ShipmentController.updateShipmentStatus
);

router.post(
  '/:id/checkpoints',
  requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER),
  validate(addCheckpointSchema),
  ShipmentController.addCheckpoint
);

export default router;
