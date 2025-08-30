/**
 * Testcontainers setup utilities for integration tests
 */

import { GenericContainer } from 'testcontainers';
import { Kysely } from 'kysely';
import { MysqlDialect } from 'kysely';
import mysql from 'mysql2';
import { setupTestDatabase, cleanupTestDatabase } from './database-setup.js';
import type { Database } from '../database/types.js';

/**
 * Test database context returned by createTestDatabase
 */
export interface TestDatabaseContext {
  /** Kysely database instance */
  db: Kysely<Database>;
  /** TiDB container instance */
  container: any;
  /** Cleanup function to truncate all tables */
  cleanup: () => Promise<void>;
}

/**
 * Create a test database with TiDB container and run migrations
 * @returns Test database context with db, container, and cleanup function
 */
export async function createTestDatabase(): Promise<TestDatabaseContext> {
  // Start TiDB container
  const container = await new GenericContainer('pingcap/tidb:v7.5.0')
    .withExposedPorts(4000, 10080) // 4000 for MySQL protocol, 10080 for status
    .withEnvironment({
      MYSQL_ALLOW_EMPTY_PASSWORD: '1',
    })
    .start();

  // Wait for TiDB to be ready
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Create database connection
  // Using non-promise mysql2 to fix Kysely/TiDB compatibility issue
  const pool = mysql.createPool({
    host: container.getHost(),
    port: container.getMappedPort(4000),
    user: 'root',
    password: '',
    database: 'test',
    connectionLimit: 10,
    waitForConnections: true,
    queueLimit: 0,
  });

  // Create Kysely instance
  const db = new Kysely<Database>({
    dialect: new MysqlDialect({ pool }),
  });

  // Run migrations
  await setupTestDatabase(db);

  // Return context with cleanup function
  return {
    db,
    container,
    cleanup: async () => {
      await cleanupTestDatabase(db);
    },
  };
}

/**
 * Destroy test database and stop container
 * Call this in afterAll() hook
 */
export async function destroyTestDatabase(
  context: TestDatabaseContext
): Promise<void> {
  await context.db.destroy();
  await context.container.stop();
}
