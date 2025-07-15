/**
 * Testcontainers setup utilities for integration tests
 */

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { Kysely } from 'kysely';
import { PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { setupTestDatabase, cleanupTestDatabase } from './database-setup.js';
import type { Database } from '../database/types.js';

/**
 * Test database context returned by createTestDatabase
 */
export interface TestDatabaseContext {
  /** Kysely database instance */
  db: Kysely<Database>;
  /** PostgreSQL container instance */
  container: any;
  /** Cleanup function to truncate all tables */
  cleanup: () => Promise<void>;
}

/**
 * Create a test database with PostgreSQL container and run migrations
 * @returns Test database context with db, container, and cleanup function
 */
export async function createTestDatabase(): Promise<TestDatabaseContext> {
  // Start PostgreSQL container
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('test_db')
    .withUsername('test_user')
    .withPassword('test_password')
    .start();

  // Create database connection
  const pool = new Pool({
    host: container.getHost(),
    port: container.getPort(),
    database: container.getDatabase(),
    user: container.getUsername(),
    password: container.getPassword(),
  });

  // Create Kysely instance
  const db = new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
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
