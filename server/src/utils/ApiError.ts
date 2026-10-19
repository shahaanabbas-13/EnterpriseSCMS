/**
 * Custom error class for API errors.
 * Extends Error with HTTP status code and optional validation errors.
 * Used by the global error handler middleware.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errors: unknown[];

  constructor(
    statusCode: number,
    message: string,
    errors: unknown[] = [],
    isOperational = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.errors = errors;

    // Maintains proper stack trace in V8
    Error.captureStackTrace(this, this.constructor);
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  // Factory methods for common HTTP errors
  static badRequest(message = 'Bad Request', errors: unknown[] = []): ApiError {
    return new ApiError(400, message, errors);
  }

  static unauthorized(message = 'Unauthorized'): ApiError {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Forbidden'): ApiError {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found'): ApiError {
    return new ApiError(404, message);
  }

  static conflict(message = 'Conflict'): ApiError {
    return new ApiError(409, message);
  }

  static internal(message = 'Internal Server Error'): ApiError {
    return new ApiError(500, message, [], false);
  }
}
