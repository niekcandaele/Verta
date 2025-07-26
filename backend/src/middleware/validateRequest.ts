/**
 * Request validation middleware
 */

import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { ApiError } from './errorHandler.js';

interface ValidationConfig {
  body?: z.ZodSchema<any>;
  query?: z.ZodSchema<any>;
  params?: z.ZodSchema<any>;
}

export function validateRequest(config: ValidationConfig) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (config.body) {
        req.body = await config.body.parseAsync(req.body);
      }
      if (config.query) {
        req.query = await config.query.parseAsync(req.query);
      }
      if (config.params) {
        req.params = await config.params.parseAsync(req.params);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        }));
        next(
          new ApiError(
            400,
            'ValidationError',
            'Validation failed',
            formattedErrors
          )
        );
      } else {
        next(error);
      }
    }
  };
}
