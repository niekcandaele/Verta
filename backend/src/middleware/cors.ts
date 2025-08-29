/**
 * CORS middleware for permissive cross-origin requests
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Permissive CORS middleware
 * Allows all origins, methods, and headers for public API
 */
export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Allow all origins
  res.header('Access-Control-Allow-Origin', '*');
  
  // Allow all methods
  res.header('Access-Control-Allow-Methods', '*');
  
  // Allow all headers
  res.header('Access-Control-Allow-Headers', '*');
  
  // Allow credentials
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Set max age for preflight caching (1 hour)
  res.header('Access-Control-Max-Age', '3600');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  
  next();
}

export default corsMiddleware;