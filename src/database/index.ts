import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { config } from '../config/env.js';
import type { Database } from './types.js';

/**
 * Create and configure the database connection pool
 */
const createPool = () => {
  return new Pool({
    connectionString: config.DATABASE_URL,
    max: config.DATABASE_POOL_SIZE,
    // Additional pool configuration
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
};

/**
 * Initialize Kysely database instance with PostgreSQL dialect
 */
const createDatabase = (): Kysely<Database> => {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: createPool(),
    }),
    log(event) {
      if (config.LOG_LEVEL === 'verbose') {
        if (event.level === 'query') {
          console.log('Query:', event.query.sql);
          console.log('Parameters:', event.query.parameters);
        }
      }
    },
  });
};

/**
 * Global database instance
 * This ensures we maintain a single connection pool throughout the application
 */
export const db = createDatabase();

/**
 * Export database types for use in other modules
 */
export type { Database } from './types.js';
export * from './types.js';
