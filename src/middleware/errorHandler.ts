/**
 * Express error handling middleware
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ServiceError, ServiceErrorType } from '../services/types.js';

/**
 * Standard error response format
 */
interface ErrorResponse {
  error: string;
  message: string;
  details?: unknown;
  timestamp: string;
}

/**
 * Map service error types to HTTP status codes
 */
function getStatusCodeForServiceError(errorType: ServiceErrorType): number {
  switch (errorType) {
    case ServiceErrorType.VALIDATION_ERROR:
      return 400;
    case ServiceErrorType.NOT_FOUND:
      return 404;
    case ServiceErrorType.DUPLICATE_ENTRY:
      return 409;
    case ServiceErrorType.BUSINESS_RULE_VIOLATION:
      return 422;
    case ServiceErrorType.DATABASE_ERROR:
    case ServiceErrorType.INTERNAL_ERROR:
    default:
      return 500;
  }
}

/**
 * Format Zod validation errors into a more readable structure
 */
function formatZodError(error: ZodError): {
  error: string;
  message: string;
  details: {
    issues: Array<{
      path: string;
      message: string;
    }>;
  };
} {
  const issues = error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));

  return {
    error: 'Validation Error',
    message: 'Invalid request data',
    details: { issues },
  };
}

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public error: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Express error handling middleware
 * Handles different error types and returns consistent error responses
 */
export function errorHandler(
  err: Error | ApiError | ServiceError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error for debugging (in production, use proper logging service)
  console.error('Error:', err);

  const timestamp = new Date().toISOString();

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const formatted = formatZodError(err);
    res.status(400).json({
      ...formatted,
      timestamp,
    });
    return;
  }

  // Handle custom API errors
  if (err instanceof ApiError) {
    const response: ErrorResponse = {
      error: err.error,
      message: err.message,
      timestamp,
    };
    if (err.details) {
      response.details = err.details;
    }
    res.status(err.statusCode).json(response);
    return;
  }

  // Handle service errors (from service layer)
  if ('type' in err && 'message' in err) {
    const serviceError = err as ServiceError;
    const statusCode = getStatusCodeForServiceError(serviceError.type);
    const response: ErrorResponse = {
      error: serviceError.type.replace(/_/g, ' ').toLowerCase(),
      message: serviceError.message,
      timestamp,
    };
    if (serviceError.details) {
      response.details = serviceError.details;
    }
    res.status(statusCode).json(response);
    return;
  }

  // Handle database errors
  if (err.message?.includes('duplicate key')) {
    res.status(409).json({
      error: 'Duplicate Entry',
      message: 'A resource with the same unique constraint already exists',
      timestamp,
    });
    return;
  }

  if (err.message?.includes('violates foreign key')) {
    res.status(400).json({
      error: 'Invalid Reference',
      message: 'The referenced resource does not exist',
      timestamp,
    });
    return;
  }

  // Default error response for unhandled errors
  const isDevelopment = process.env.NODE_ENV === 'development';
  const response: ErrorResponse = {
    error: 'Internal Server Error',
    message: isDevelopment ? err.message : 'Something went wrong',
    timestamp,
  };

  if (isDevelopment && err.stack) {
    response.details = { stack: err.stack };
  }

  res.status(500).json(response);
}

/**
 * Async error wrapper for route handlers
 * Catches async errors and passes them to the error handler
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
