/**
 * Express error handling middleware
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ServiceError, ServiceErrorType } from '../services/types.js';
import logger from '../utils/logger.js';
import { getRequestId } from './requestLogger.js';

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
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error with request context
  const requestId = getRequestId(req);
  const errorInfo: any = {
    error: err.message,
    requestId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  };

  // Add stack and name if they exist (Error objects have them, ServiceError might not)
  if ('stack' in err) {
    errorInfo.stack = err.stack;
  }
  if ('name' in err) {
    errorInfo.name = err.name;
  }

  logger.error('Request error', errorInfo);

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
    // Only include details in development mode
    if (err.details && process.env.NODE_ENV === 'development') {
      response.details = err.details;
    }
    res.status(err.statusCode).json(response);
    return;
  }

  // Handle service errors (from service layer)
  if ('type' in err && 'message' in err) {
    const serviceError = err as ServiceError;
    const statusCode = getStatusCodeForServiceError(serviceError.type);

    // Use generic messages in production
    const isDevelopment = process.env.NODE_ENV === 'development';
    let message = serviceError.message;

    if (!isDevelopment) {
      // Map to generic messages based on error type
      switch (serviceError.type) {
        case ServiceErrorType.VALIDATION_ERROR:
          message = 'Invalid request data.';
          break;
        case ServiceErrorType.NOT_FOUND:
          message = 'Resource not found.';
          break;
        case ServiceErrorType.DUPLICATE_ENTRY:
          message = 'Resource already exists.';
          break;
        case ServiceErrorType.BUSINESS_RULE_VIOLATION:
          message = 'Request cannot be processed.';
          break;
        case ServiceErrorType.DATABASE_ERROR:
        case ServiceErrorType.INTERNAL_ERROR:
        default:
          message = 'An error occurred. Please try again.';
          break;
      }
    }

    const response: ErrorResponse = {
      error: serviceError.type.replace(/_/g, ' ').toLowerCase(),
      message,
      timestamp,
    };

    // Only include details in development mode
    if (serviceError.details && isDevelopment) {
      response.details = serviceError.details;
    }

    res.status(statusCode).json(response);
    return;
  }

  // Handle rate limit errors
  if (
    err.message?.includes('RATE_LIMIT_EXCEEDED') ||
    err.message?.includes('rate limit')
  ) {
    res.status(429).json({
      error: 'Rate Limit Exceeded',
      message: 'Rate limit exceeded. Please try again later.',
      timestamp,
    });
    return;
  }

  // Handle database errors
  if (err.message?.includes('duplicate key')) {
    res.status(409).json({
      error: 'Duplicate Entry',
      message: 'Resource already exists.',
      timestamp,
    });
    return;
  }

  if (err.message?.includes('violates foreign key')) {
    res.status(400).json({
      error: 'Invalid Reference',
      message: 'Invalid request data.',
      timestamp,
    });
    return;
  }

  // Default error response for unhandled errors
  const isDevelopment = process.env.NODE_ENV === 'development';
  const response: ErrorResponse = {
    error: 'Internal Server Error',
    message: isDevelopment
      ? err.message
      : 'An error occurred. Please try again.',
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
