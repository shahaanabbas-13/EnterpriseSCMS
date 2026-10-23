import { Router } from 'express';
import { AuditController } from '../controllers/audit.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { UserRole } from '../types';

const router = Router();
router.use(authenticate, requireRole(UserRole.ADMIN));
router.get('/', AuditController.getLogs);

export default router;
