import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { UserRole } from '../types';
import { createUserSchema, updateUserSchema } from '../validators/user.validator';

const router = Router();
router.use(authenticate, requireRole(UserRole.ADMIN));
router.get('/', UserController.list);
router.post('/', validate(createUserSchema), UserController.create);
router.patch('/:id', validate(updateUserSchema), UserController.update);

export default router;
