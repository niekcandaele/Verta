import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // MySQL/TiDB doesn't support CHECK constraints in the same way as PostgreSQL
  // The channel type validation will be enforced at the application level
  // This migration just documents the addition of the 'category' type

  // Optionally, we could modify the column to be an ENUM, but that's more restrictive
  // For now, we'll just add a comment to document the allowed values
  await sql`
    ALTER TABLE channels 
    MODIFY COLUMN type VARCHAR(20) 
    COMMENT 'Channel type: text, thread, forum, or category'
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // First, we need to handle any existing category channels
  const categoryChannels = await db
    .selectFrom('channels')
    .select('id')
    .where('type', '=', 'category')
    .execute();

  if (categoryChannels.length > 0) {
    throw new Error(
      `Cannot revert migration: ${categoryChannels.length} category channels exist. ` +
        'Please manually handle these channels before reverting.'
    );
  }

  // Just update the comment to reflect the removal of category type
  await sql`
    ALTER TABLE channels 
    MODIFY COLUMN type VARCHAR(20) 
    COMMENT 'Channel type: text, thread, or forum'
  `.execute(db);
}
