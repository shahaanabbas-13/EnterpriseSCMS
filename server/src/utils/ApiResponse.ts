import { Response } from 'express';

/**
 * Standardized API response wrapper.
 * Ensures every API response follows the same format:
 * { success, message, data?, errors? }
 */
export class ApiResponse {
  /**
   * Send a success response.
   */
  static success<T>(
    res: Response,
    data: T,
    message = 'Success',
    statusCode = 200
  ): Response {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
    });
  }

  /**
   * Send a created response (201).
   */
  static created<T>(res: Response, data: T, message = 'Created'): Response {
    return res.status(201).json({
      success: true,
      message,
      data,
    });
  }

  /**
   * Send a no-content response (204).
   */
  static noContent(res: Response): Response {
    return res.status(204).send();
  }

  /**
   * Send an error response.
   */
  static error(
    res: Response,
    message = 'Error',
    statusCode = 500,
    errors: unknown[] = []
  ): Response {
    return res.status(statusCode).json({
      success: false,
      message,
      errors,
    });
  }

  /**
   * Send a paginated response.
   */
  static paginated<T>(
    res: Response,
    data: T[],
    total: number,
    page: number,
    limit: number,
    message = 'Success'
  ): Response {
    return res.status(200).json({
      success: true,
      message,
      data,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  }
}
