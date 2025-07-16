/**
 * Tests for error handling middleware
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { errorHandler, ApiError } from '../errorHandler.js';
import { ServiceErrorType, createServiceError } from '../../services/types.js';

// Mock the logger
vi.mock('../../utils/logger.js', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('errorHandler', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      method: 'GET',
      path: '/test',
      ip: '127.0.0.1',
      get: vi.fn().mockReturnValue('Mozilla/5.0'),
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn() as unknown as NextFunction;
    vi.clearAllMocks();
  });

  describe('ZodError handling', () => {
    it('should handle Zod validation errors', () => {
      const zodError = new ZodError([
        {
          code: 'too_small',
          minimum: 3,
          type: 'string',
          inclusive: true,
          exact: false,
          message: 'String must contain at least 3 character(s)',
          path: ['name'],
        } as any,
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['slug'],
          message: 'Expected string, received number',
        } as any,
      ]);

      errorHandler(zodError, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Validation Error',
        message: 'Invalid request data',
        details: {
          issues: [
            {
              path: 'name',
              message: 'String must contain at least 3 character(s)',
            },
            {
              path: 'slug',
              message: 'Expected string, received number',
            },
          ],
        },
        timestamp: expect.any(String),
      });
    });
  });

  describe('ApiError handling', () => {
    it('should handle ApiError with details', () => {
      const apiError = new ApiError(404, 'Not Found', 'Tenant not found', {
        id: '123',
      });

      errorHandler(apiError, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: 'Tenant not found',
        details: { id: '123' },
        timestamp: expect.any(String),
      });
    });

    it('should handle ApiError without details', () => {
      const apiError = new ApiError(401, 'Unauthorized', 'Invalid API key');

      errorHandler(apiError, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid API key',
        timestamp: expect.any(String),
      });
    });
  });

  describe('ServiceError handling', () => {
    it('should handle validation service errors', () => {
      const serviceError = createServiceError(
        ServiceErrorType.VALIDATION_ERROR,
        'Invalid input data',
        { field: 'email' }
      );

      errorHandler(
        serviceError as any,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'validation error',
        message: 'Invalid input data',
        details: { field: 'email' },
        timestamp: expect.any(String),
      });
    });

    it('should handle not found service errors', () => {
      const serviceError = createServiceError(
        ServiceErrorType.NOT_FOUND,
        'Resource not found'
      );

      errorHandler(
        serviceError as any,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'not found',
        message: 'Resource not found',
        timestamp: expect.any(String),
      });
    });

    it('should handle duplicate entry service errors', () => {
      const serviceError = createServiceError(
        ServiceErrorType.DUPLICATE_ENTRY,
        'Slug already exists'
      );

      errorHandler(
        serviceError as any,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'duplicate entry',
        message: 'Slug already exists',
        timestamp: expect.any(String),
      });
    });

    it('should handle business rule violation service errors', () => {
      const serviceError = createServiceError(
        ServiceErrorType.BUSINESS_RULE_VIOLATION,
        'Cannot delete active tenant'
      );

      errorHandler(
        serviceError as any,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.status).toHaveBeenCalledWith(422);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'business rule violation',
        message: 'Cannot delete active tenant',
        timestamp: expect.any(String),
      });
    });

    it('should handle database service errors', () => {
      const serviceError = createServiceError(
        ServiceErrorType.DATABASE_ERROR,
        'Database connection failed'
      );

      errorHandler(
        serviceError as any,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'database error',
        message: 'Database connection failed',
        timestamp: expect.any(String),
      });
    });
  });

  describe('Database error handling', () => {
    it('should handle duplicate key errors', () => {
      const dbError = new Error(
        'duplicate key value violates unique constraint'
      );

      errorHandler(dbError, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Duplicate Entry',
        message: 'A resource with the same unique constraint already exists',
        timestamp: expect.any(String),
      });
    });

    it('should handle foreign key errors', () => {
      const dbError = new Error('violates foreign key constraint');

      errorHandler(dbError, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid Reference',
        message: 'The referenced resource does not exist',
        timestamp: expect.any(String),
      });
    });
  });

  describe('Generic error handling', () => {
    it('should handle generic errors in development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const genericError = new Error('Something went wrong');
      genericError.stack = 'Error: Something went wrong\\n    at ...';

      errorHandler(
        genericError,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Something went wrong',
        details: { stack: genericError.stack },
        timestamp: expect.any(String),
      });

      process.env.NODE_ENV = originalEnv;
    });

    it('should handle generic errors in production mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const genericError = new Error('Sensitive error message');

      errorHandler(
        genericError,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Something went wrong',
        timestamp: expect.any(String),
      });

      process.env.NODE_ENV = originalEnv;
    });
  });

  it('should log all errors', async () => {
    const error = new Error('Test error');
    const logger = await import('../../utils/logger.js');

    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    expect(logger.default.error).toHaveBeenCalledWith(
      'Request error',
      expect.objectContaining({
        error: 'Test error',
        method: 'GET',
        path: '/test',
        ip: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
        stack: expect.stringContaining('Test error'),
        name: 'Error',
      })
    );
  });
});
