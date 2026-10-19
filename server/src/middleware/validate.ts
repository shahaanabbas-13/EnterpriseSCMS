import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Zod validation middleware factory.
 * Validates request body, query, or params against a Zod schema.
 *
 * Usage:
 *   router.post('/products', validate(createProductSchema), controller.create);
 *
 * Where createProductSchema is a Zod object schema like:
 *   z.object({ body: z.object({ name: z.string(), ... }) })
 */

interface ValidationSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export const validate = (schemas: ValidationSchemas) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const errors: Array<{ field: string; message: string }> = [];

    // Validate body
    if (schemas.body) {
      try {
        req.body = schemas.body.parse(req.body);
      } catch (err) {
        if (err instanceof ZodError) {
          errors.push(
            ...err.errors.map((e) => ({
              field: `body.${e.path.join('.')}`,
              message: e.message,
            }))
          );
        }
      }
    }

    // Validate query
    if (schemas.query) {
      try {
        req.query = schemas.query.parse(req.query) as any;
      } catch (err) {
        if (err instanceof ZodError) {
          errors.push(
            ...err.errors.map((e) => ({
              field: `query.${e.path.join('.')}`,
              message: e.message,
            }))
          );
        }
      }
    }

    // Validate params
    if (schemas.params) {
      try {
        req.params = schemas.params.parse(req.params) as any;
      } catch (err) {
        if (err instanceof ZodError) {
          errors.push(
            ...err.errors.map((e) => ({
              field: `params.${e.path.join('.')}`,
              message: e.message,
            }))
          );
        }
      }
    }

    if (errors.length > 0) {
      const { ApiError } = require('../utils/ApiError');
      throw ApiError.badRequest('Validation failed', errors);
    }

    next();
  };
};
