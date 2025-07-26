import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { validateApiKey } from '../auth.js';

// Mock the config module
vi.mock('../../config/env.js', () => ({
  config: {
    ADMIN_API_KEY: 'test-api-key-123',
  },
}));

describe('Authentication Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let jsonSpy: ReturnType<typeof vi.fn>;
  let statusSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Reset mocks before each test
    jsonSpy = vi.fn().mockReturnThis();
    statusSpy = vi.fn().mockReturnThis();

    mockRequest = {
      headers: {},
    };

    mockResponse = {
      status: statusSpy,
      json: jsonSpy,
    } as Partial<Response>;

    mockNext = vi.fn() as unknown as NextFunction;
  });

  describe('validateApiKey', () => {
    it('should call next() when valid API key is provided', () => {
      // Arrange
      mockRequest.headers = {
        'x-api-key': 'test-api-key-123',
      };

      // Act
      validateApiKey(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockNext).toHaveBeenCalledOnce();
      expect(statusSpy).not.toHaveBeenCalled();
      expect(jsonSpy).not.toHaveBeenCalled();
    });

    it('should return 401 when X-API-KEY header is missing', () => {
      // Arrange
      mockRequest.headers = {};

      // Act
      validateApiKey(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'X-API-KEY header is required',
        timestamp: expect.any(String),
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when API key is invalid', () => {
      // Arrange
      mockRequest.headers = {
        'x-api-key': 'invalid-api-key',
      };

      // Act
      validateApiKey(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid API key',
        timestamp: expect.any(String),
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when API key is empty string', () => {
      // Arrange
      mockRequest.headers = {
        'x-api-key': '',
      };

      // Act
      validateApiKey(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'X-API-KEY header is required',
        timestamp: expect.any(String),
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle API key provided as array (first element)', () => {
      // Arrange
      mockRequest.headers = {
        'x-api-key': ['test-api-key-123', 'duplicate-header'],
      };

      // Act
      validateApiKey(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockNext).toHaveBeenCalledOnce();
      expect(statusSpy).not.toHaveBeenCalled();
      expect(jsonSpy).not.toHaveBeenCalled();
    });

    it('should return 401 when API key array contains invalid key', () => {
      // Arrange
      mockRequest.headers = {
        'x-api-key': ['invalid-key', 'test-api-key-123'],
      };

      // Act
      validateApiKey(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid API key',
        timestamp: expect.any(String),
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should include valid timestamp in error response', () => {
      // Arrange
      const beforeTime = new Date().toISOString();
      mockRequest.headers = {
        'x-api-key': 'invalid-key',
      };

      // Act
      validateApiKey(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      const afterTime = new Date().toISOString();
      const errorResponse = jsonSpy.mock.calls[0][0];

      expect(errorResponse.timestamp).toBeDefined();
      expect(errorResponse.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
      expect(errorResponse.timestamp >= beforeTime).toBe(true);
      expect(errorResponse.timestamp <= afterTime).toBe(true);
    });

    it('should be case-sensitive for API key comparison', () => {
      // Arrange
      mockRequest.headers = {
        'x-api-key': 'TEST-API-KEY-123', // Different case
      };

      // Act
      validateApiKey(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid API key',
        timestamp: expect.any(String),
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle header name case-insensitively', () => {
      // Arrange - Express typically normalizes headers to lowercase
      mockRequest.headers = {
        'X-API-KEY': 'test-api-key-123',
      };

      // Act
      validateApiKey(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert - This should fail because Express normalizes to lowercase
      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
