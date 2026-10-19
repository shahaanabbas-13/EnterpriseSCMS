import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { UserRole } from '../types';

const router = Router();

router.use(authenticate);

// All analytics are read-only, accessible by Admin and Operations Manager
const analyticsRoles = [UserRole.ADMIN, UserRole.OPERATIONS_MANAGER];

router.get('/dashboard', requireRole(...analyticsRoles), AnalyticsController.getDashboardSummary);
router.get('/revenue', requireRole(...analyticsRoles), AnalyticsController.getRevenueAnalytics);
router.get('/inventory', requireRole(...analyticsRoles), AnalyticsController.getInventoryAnalytics);
router.get('/orders', requireRole(...analyticsRoles), AnalyticsController.getOrderAnalytics);
router.get('/vendors', requireRole(...analyticsRoles), AnalyticsController.getVendorRankings);

export default router;
