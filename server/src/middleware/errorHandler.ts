import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';

/**
 * Global error handler middleware.
 * Must be registered LAST in the middleware chain.
 *
 * Catches all errors (thrown or passed via next(err)):
 * - ApiError instances → structured response with correct status
 * - Mongoose ValidationError → 400 with field-level details
 * - Mongoose CastError → 400 (invalid ObjectId, etc.)
 * - Unknown errors → 500 with generic message (hides internals)
 */
export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  logger.error(`${err.name}: ${err.message}`, err.stack);

  // 1. Our custom ApiError
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errors: err.errors,
    });
    return;
  }

  // 2. Mongoose Validation Error
  if (err.name === 'ValidationError') {
    const mongooseErr = err as any;
    const errors = Object.values(mongooseErr.errors).map((e: any) => ({
      field: e.path,
      message: e.message,
    }));
    res.status(400).json({
      success: false,
      message: 'Validation Error',
      errors,
    });
    return;
  }

  // 3. Mongoose CastError (invalid ObjectId, etc.)
  if (err.name === 'CastError') {
    const castErr = err as any;
    res.status(400).json({
      success: false,
      message: `Invalid ${castErr.path}: ${castErr.value}`,
      errors: [],
    });
    return;
  }

  // 4. JWT Errors
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({
      success: false,
      message: 'Invalid token',
      errors: [],
    });
    return;
  }

  if (err.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      message: 'Token expired',
      errors: [],
    });
    return;
  }

  // 5. MongoDB Duplicate Key Error
  if ((err as any).code === 11000) {
    const dupErr = err as any;
    const field = Object.keys(dupErr.keyPattern || {})[0] || 'field';
    res.status(409).json({
      success: false,
      message: `Duplicate value for ${field}`,
      errors: [{ field, message: 'Already exists' }],
    });
    return;
  }

  // 6. Unknown / unhandled error — hide internals in production
  const message =
    process.env.NODE_ENV === 'production'
      ? 'Internal Server Error'
      : err.message;

  res.status(500).json({
    success: false,
    message,
    errors: [],
  });
};
