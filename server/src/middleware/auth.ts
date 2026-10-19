import { Response, NextFunction } from 'express';
import { AuthRequest, JwtPayload, UserRole } from '../types';
import { AuthService } from '../services/auth.service';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';

/**
 * Authentication middleware.
 * Verifies JWT access token from Authorization header.
 * Attaches decoded user payload to req.user.
 *
 * Usage:
 *   router.get('/protected', authenticate, controller.method);
 */
export const authenticate = (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw ApiError.unauthorized(
        'No token provided. Authorization header must be: Bearer <token>'
      );
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      throw ApiError.unauthorized('Malformed authorization header');
    }

    const payload: JwtPayload = AuthService.verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Role-based access control middleware factory.
 * Checks if the authenticated user has one of the allowed roles.
 *
 * Must be used AFTER authenticate middleware.
 *
 * Usage:
 *   router.delete('/products/:id', authenticate, requireRole(UserRole.ADMIN), controller.delete);
 *   router.get('/inventory', authenticate, requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER), controller.list);
 */
export const requireRole = (...roles: UserRole[]) => {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required');
      }

      if (!roles.includes(req.user.role)) {
        logger.warn(
          `Access denied: User ${req.user.email} (${req.user.role}) attempted to access route requiring: ${roles.join(', ')}`
        );
        throw ApiError.forbidden(
          `Access denied. Required role(s): ${roles.join(', ')}`
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
