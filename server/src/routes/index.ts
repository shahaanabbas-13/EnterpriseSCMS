import { Router } from 'express';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';
import inventoryRoutes from './inventory.routes';
import warehouseRoutes from './warehouse.routes';
import vendorRoutes from './vendor.routes';
import orderRoutes from './order.routes';
import shipmentRoutes from './shipment.routes';
import analyticsRoutes from './analytics.routes';
import auditRoutes from './audit.routes';
import userRoutes from './user.routes';

const router = Router();

// ─── Mount Module Routes ───────────────────────────────────────────────
router.use('/health', healthRoutes);                // Phase 0
router.use('/auth', authRoutes);                    // Phase 1
router.use('/inventory', inventoryRoutes);          // Phase 2
router.use('/warehouses', warehouseRoutes);         // Phase 2
router.use('/vendors', vendorRoutes);               // Phase 3
router.use('/orders', orderRoutes);                 // Phase 4
router.use('/shipments', shipmentRoutes);           // Phase 5
router.use('/analytics', analyticsRoutes);          // Phase 6
router.use('/audit-logs', auditRoutes);              // Phase 7
router.use('/users', userRoutes);                    // Phase 8

export default router;
