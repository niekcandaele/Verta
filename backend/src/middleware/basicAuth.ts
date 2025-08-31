import basicAuth from 'express-basic-auth';
import { config } from '../config/env.js';

/**
 * Basic authentication middleware for Bull Board
 * Uses username: 'admin' and password: ADMIN_API_KEY from environment
 */
export const bullBoardAuth = basicAuth({
  users: {
    admin: config.ADMIN_API_KEY,
  },
  challenge: true,
  realm: 'Verta Queue Dashboard',
  unauthorizedResponse: () => {
    return {
      error: 'Unauthorized',
      message: 'Invalid credentials for Bull Board access',
      timestamp: new Date().toISOString(),
    };
  },
});
