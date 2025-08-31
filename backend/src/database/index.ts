import { Kysely, MysqlDialect } from 'kysely';
import mysql from 'mysql2';
import { config } from '../config/env.js';
import type { Database } from './types.js';

/**
 * Create and configure the database connection pool
 */
const createConnectionPool = () => {
  // Parse the DATABASE_URL to extract connection details
  const url = new URL(config.DATABASE_URL);

  // Check if we're connecting to TiDB Cloud (requires SSL)
  const isTiDBCloud = url.hostname.includes('tidbcloud.com');

  // Using non-promise mysql2 to fix Kysely/TiDB compatibility issue
  return mysql.createPool({
    host: url.hostname,
    port: parseInt(url.port || '3306'),
    user: url.username,
    password: url.password,
    database: url.pathname.substring(1), // Remove leading '/'
    connectionLimit: config.DATABASE_POOL_SIZE,
    // Additional pool configuration
    waitForConnections: true,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    // SSL configuration for TiDB Cloud
    ...(isTiDBCloud && {
      ssl: {
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
      },
    }),
  });
};

/**
 * Initialize Kysely database instance with MySQL dialect for TiDB
 */
const createDatabase = (): Kysely<Database> => {
  return new Kysely<Database>({
    dialect: new MysqlDialect({
      pool: createConnectionPool(),
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
 * Get database instance
 */
export async function getDatabase(): Promise<Kysely<Database>> {
  return db;
}

/**
 * Export database types for use in other modules
 */
export type { Database } from './types.js';
export * from './types.js';
