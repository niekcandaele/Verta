import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env.js';

/**
 * Authentication middleware that validates API key from X-API-KEY header
 */
export function validateApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const apiKey = req.headers['x-api-key'];

  // Check if API key header is present
  if (!apiKey) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'X-API-KEY header is required',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Ensure API key is a string (not an array)
  const providedKey = Array.isArray(apiKey) ? apiKey[0] : apiKey;

  // Check if API key is empty after extracting from array
  if (!providedKey) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'X-API-KEY header is required',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Compare API key
  if (providedKey !== config.ADMIN_API_KEY) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid API key',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // API key is valid, proceed to next middleware
  next();
}

/**
 * Error response interface for authentication failures
 */
export interface AuthErrorResponse {
  error: string;
  message: string;
  timestamp: string;
}
