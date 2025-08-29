/**
 * Test database setup utilities
 */

import { Kysely, sql } from 'kysely';
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
  const migration004 = await import(
    '../database/migrations/004_fix_reply_to_id_type.js'
  );
  const migration005 = await import(
    '../database/migrations/005_fix_parent_channel_id_type.js'
  );
  const migration006 = await import(
    '../database/migrations/006_create_tenant_branding_table.js'
  );
  const migration007 = await import(
    '../database/migrations/007_add_channel_sync_tracking.js'
  );
  const migration008 = await import(
    '../database/migrations/008_add_category_channel_type.js'
  );

  // Run the migrations in order
  await migration001.up(db);
  await migration002.up(db);
  await migration003.up(db);
  await migration004.up(db);
  await migration005.up(db);
  await migration006.up(db);
  await migration007.up(db);
  await migration008.up(db);
}

/**
 * Clean up test database by truncating all tables
 * This is faster than dropping and recreating
 * @param db - Kysely database instance
 */
export async function cleanupTestDatabase(db: Kysely<Database>): Promise<void> {
  // Disable foreign key checks temporarily
  await sql`SET FOREIGN_KEY_CHECKS = 0`.execute(db);

  // Get all table names in reverse order of dependencies
  const tables = [
    'channel_sync_jobs',
    'message_attachments',
    'message_emoji_reactions',
    'sync_progress',
    'messages',
    'channels',
    'tenant_branding',
    'tenants',
  ];

  // Truncate all tables
  for (const table of tables) {
    await db.deleteFrom(table as any).execute();
  }

  // Re-enable foreign key checks
  await sql`SET FOREIGN_KEY_CHECKS = 1`.execute(db);
}

/**
 * Drop all tables (useful for complete cleanup)
 * @param db - Kysely database instance
 */
export async function dropAllTables(db: Kysely<Database>): Promise<void> {
  // Disable foreign key checks
  await sql`SET FOREIGN_KEY_CHECKS = 0`.execute(db);

  // Drop tables in reverse order of creation to handle foreign keys
  await db.schema.dropTable('channel_sync_jobs').ifExists().execute();
  await db.schema.dropTable('tenant_branding').ifExists().execute();
  await db.schema.dropTable('message_attachments').ifExists().execute();
  await db.schema.dropTable('message_emoji_reactions').ifExists().execute();
  await db.schema.dropTable('sync_progress').ifExists().execute();
  await db.schema.dropTable('messages').ifExists().execute();
  await db.schema.dropTable('channels').ifExists().execute();
  await db.schema.dropTable('tenants').ifExists().execute();

  // Re-enable foreign key checks
  await sql`SET FOREIGN_KEY_CHECKS = 1`.execute(db);
}