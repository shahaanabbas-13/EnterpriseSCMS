import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  changePasswordSchema,
} from '../validators/auth.validator';

const router = Router();

/**
 * Auth routes.
 *
 * Public:
 *   POST /api/auth/register  — Create account
 *   POST /api/auth/login     — Login
 *   POST /api/auth/refresh   — Refresh tokens
 *
 * Protected:
 *   POST /api/auth/logout    — Logout (revoke refresh token)
 *   GET  /api/auth/profile   — Get current user profile
 */

// Public routes (no auth required)
router.post('/register', validate(registerSchema), AuthController.register);
router.post('/login', validate(loginSchema), AuthController.login);
router.post('/refresh', validate(refreshSchema), AuthController.refresh);

// Protected routes (require valid access token)
router.post('/logout', authenticate, validate(logoutSchema), AuthController.logout);
router.post('/change-password', authenticate, validate(changePasswordSchema), AuthController.changePassword);
router.get('/profile', authenticate, AuthController.getProfile);

export default router;
