/**
 * Test database setup utilities
 */

import { Kysely } from 'kysely';
import type { Database } from '../database/types.js';

/**
 * Set up test database by running migrations
 * @param db - Kysely database instance
 */
export async function setupTestDatabase(db: Kysely<Database>): Promise<void> {
  // In test environment, we import migrations directly
  // This avoids issues with FileMigrationProvider and TypeScript files
  const migration001 = await import(
    '../database/migrations/001_create_tenant_table.js'
  );
  const migration002 = await import(
    '../database/migrations/002_create_sync_tables.js'
  );
  const migration003 = await import(
    '../database/migrations/003_add_unique_constraints.js'
  );

  // Run the migrations in order
  await migration001.up(db);
  await migration002.up(db);
  await migration003.up(db);
}

/**
 * Clean up test database by truncating all tables
 * This is faster than dropping and recreating
 * @param db - Kysely database instance
 */
export async function cleanupTestDatabase(db: Kysely<Database>): Promise<void> {
  // Get all table names in reverse order of dependencies
  const tables = [
    'message_attachments',
    'message_emoji_reactions',
    'sync_progress',
    'messages',
    'channels',
    'tenants',
  ];

  // Truncate all tables
  for (const table of tables) {
    await db.deleteFrom(table as any).execute();
  }
}

/**
 * Drop all tables (useful for complete cleanup)
 * @param db - Kysely database instance
 */
export async function dropAllTables(db: Kysely<Database>): Promise<void> {
  // Drop tables in reverse order of creation to handle foreign keys
  await db.schema.dropTable('tenants').ifExists().execute();
}
