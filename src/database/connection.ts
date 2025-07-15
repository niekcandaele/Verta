import { sql } from 'kysely';
import { db } from './index.js';

/**
 * Test database connectivity
 * @returns Promise<boolean> - true if connection is successful
 */
export async function testConnection(): Promise<boolean> {
  try {
    const result = await sql<{ now: Date }>`SELECT NOW()`.execute(db);
    console.log('Database connection established at:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
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
    console.log('Database connections closed successfully');
  } catch (error) {
    console.error('Error closing database connections:', error);
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
      console.log(
        `Database connection failed. Retrying in ${retryDelay}ms... (${retries}/${maxRetries})`
      );
      await new Promise((resolve) => global.setTimeout(resolve, retryDelay));
    }
  }

  throw new Error(`Failed to connect to database after ${maxRetries} attempts`);
}
