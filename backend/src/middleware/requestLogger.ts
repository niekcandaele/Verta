import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.js';

interface RequestLogContext {
  method: string;
  path: string;
  ip: string | undefined;
  userAgent: string | undefined;
  requestId?: string;
}

interface ResponseLogContext extends RequestLogContext {
  statusCode: number;
  responseTime: number;
}

/**
 * Middleware to log incoming HTTP requests and responses
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();

  // Generate a unique request ID
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Attach request ID to request object for tracing
  (req as any).requestId = requestId;

  const requestContext: RequestLogContext = {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    requestId,
  };

  // Log incoming request
  logger.info('Incoming request', requestContext);

  // Capture response details
  const originalSend = res.send;
  res.send = function (data: any) {
    res.send = originalSend;
    res.send(data);

    const responseTime = Date.now() - startTime;
    const responseContext: ResponseLogContext = {
      ...requestContext,
      statusCode: res.statusCode,
      responseTime,
    };

    // Log based on status code
    if (res.statusCode >= 500) {
      logger.error('Request failed', responseContext);
    } else if (res.statusCode >= 400) {
      logger.warn('Request client error', responseContext);
    } else {
      logger.info('Request completed', responseContext);
    }

    return res;
  };

  next();
}

/**
 * Get request ID from request object
 */
export function getRequestId(req: Request): string | undefined {
  return (req as any).requestId;
}
