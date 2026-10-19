import { Router } from 'express';
import { HealthController } from '../controllers/health.controller';

const router = Router();

/**
 * Health check routes.
 * No authentication required — these are used by infrastructure.
 */
router.get('/', HealthController.check);
router.get('/ready', HealthController.ready);

export default router;
