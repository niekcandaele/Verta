import { Kysely, sql } from 'kysely';
import { Database } from '../types.js';

/**
 * Add slug column to channels table for human-readable URLs
 * Creates unique index on (slug, tenant_id) to ensure slug uniqueness within tenants
 */
export async function up(db: Kysely<Database>): Promise<void> {
  // Add slug column to channels table
  await db.schema
    .alterTable('channels')
    .addColumn('slug', 'varchar(255)')
    .execute();

  console.log('Successfully added slug column to channels table');

  // Create index for slug lookups
  // Unique constraint on slug + tenant_id ensures each tenant has unique channel slugs
  await sql`
    CREATE UNIQUE INDEX idx_channels_slug_tenant 
    ON channels(slug, tenant_id)
  `.execute(db);

  console.log('Successfully created unique index on (slug, tenant_id)');

  // Also create a non-unique index on slug alone for efficient lookups
  await sql`
    CREATE INDEX idx_channels_slug 
    ON channels(slug)
  `.execute(db);

  console.log('Successfully created index on slug column');
}

export async function down(db: Kysely<Database>): Promise<void> {
  // Drop indexes first
  await sql`
    DROP INDEX idx_channels_slug ON channels
  `.execute(db);

  await sql`
    DROP INDEX idx_channels_slug_tenant ON channels
  `.execute(db);

  // Drop the slug column
  await db.schema
    .alterTable('channels')
    .dropColumn('slug')
    .execute();

  console.log('Successfully removed slug column and indexes from channels table');
}