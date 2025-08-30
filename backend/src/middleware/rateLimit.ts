/**
 * Rate limiting middleware for API endpoints
 */

import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Create a rate limiter for public API endpoints
 * 1000 requests per minute globally
 */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      title: 'Rate Limit Exceeded',
      status: 429,
      type: '/errors/rate-limit-exceeded',
      detail: 'Too many requests from this IP. Please try again later.',
      instance: req.path,
    });
  },
});

/**
 * Stricter rate limiter for specific endpoints if needed
 * 100 requests per minute
 */
export const strictRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      title: 'Rate Limit Exceeded',
      status: 429,
      type: '/errors/rate-limit-exceeded',
      detail: 'Too many requests from this IP. Please try again later.',
      instance: req.path,
    });
  },
});

export default apiRateLimiter;
