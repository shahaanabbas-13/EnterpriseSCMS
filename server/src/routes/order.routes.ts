import { Router } from 'express';
import { OrderController } from '../controllers/order.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { UserRole } from '../types';
import {
  createOrderSchema,
  updateOrderStatusSchema,
  assignOrderSchema,
} from '../validators/order.validator';

const router = Router();

router.use(authenticate);

// ─── Order CRUD ─────────────────────────────────────────────────────────────
router.post(
  '/',
  requireRole(UserRole.ADMIN, UserRole.OPERATIONS_MANAGER),
  validate(createOrderSchema),
  OrderController.createOrder
);

router.get(
  '/',
  requireRole(UserRole.ADMIN, UserRole.OPERATIONS_MANAGER, UserRole.WAREHOUSE_MANAGER),
  OrderController.getOrders
);

router.get(
  '/:id',
  requireRole(UserRole.ADMIN, UserRole.OPERATIONS_MANAGER, UserRole.WAREHOUSE_MANAGER),
  OrderController.getOrderById
);

// ─── State Machine ──────────────────────────────────────────────────────────
router.patch(
  '/:id/status',
  requireRole(UserRole.ADMIN, UserRole.OPERATIONS_MANAGER, UserRole.WAREHOUSE_MANAGER),
  validate(updateOrderStatusSchema),
  OrderController.updateOrderStatus
);

router.get(
  '/:id/transitions',
  requireRole(UserRole.ADMIN, UserRole.OPERATIONS_MANAGER, UserRole.WAREHOUSE_MANAGER),
  OrderController.getOrderTransitions
);

// ─── Assignment ─────────────────────────────────────────────────────────────
router.patch(
  '/:id/assign',
  requireRole(UserRole.ADMIN, UserRole.OPERATIONS_MANAGER),
  validate(assignOrderSchema),
  OrderController.assignOrder
);

export default router;
