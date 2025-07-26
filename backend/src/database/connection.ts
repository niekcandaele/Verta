import { sql } from 'kysely';
import { db } from './index.js';
import logger from '../utils/logger.js';

/**
 * Test database connectivity
 * @returns Promise<boolean> - true if connection is successful
 */
export async function testConnection(): Promise<boolean> {
  try {
    const result = await sql<{ now: Date }>`SELECT NOW()`.execute(db);
    logger.info('Database connection established', {
      timestamp: result.rows[0].now,
    });
    return true;
  } catch (error) {
    logger.error('Database connection failed', { error });
    return false;
  }
}

/**
 * Gracefully shutdown database connections
 * Should be called during application shutdown
 */
export async function closeDatabase(): Promise<void> {
  try {
    await db.destroy();
    logger.info('Database connections closed successfully');
  } catch (error) {
    logger.error('Error closing database connections', { error });
    throw error;
  }
}

/**
 * Initialize database connection with retry logic
 * @param maxRetries - Maximum number of connection attempts
 * @param retryDelay - Delay between retries in milliseconds
 */
export async function initializeDatabase(
  maxRetries: number = 5,
  retryDelay: number = 5000
): Promise<void> {
  let retries = 0;

  while (retries < maxRetries) {
    const connected = await testConnection();

    if (connected) {
      return;
    }

    retries++;
    if (retries < maxRetries) {
      logger.warn('Database connection failed, retrying', {
        retryDelay,
        attempt: retries,
        maxRetries,
      });
      await new Promise((resolve) => global.setTimeout(resolve, retryDelay));
    }
  }

  throw new Error(`Failed to connect to database after ${maxRetries} attempts`);
}
