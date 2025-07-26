import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // First, drop the foreign key constraint on reply_to_id
  await sql`
    ALTER TABLE messages 
    DROP CONSTRAINT IF EXISTS messages_reply_to_id_fkey
  `.execute(db);

  // Drop any messages that have reply_to_id set (if any exist)
  // This is necessary because we're changing the column type
  await sql`
    DELETE FROM messages WHERE reply_to_id IS NOT NULL
  `.execute(db);

  // Change the column type from uuid to varchar(255)
  await sql`
    ALTER TABLE messages 
    ALTER COLUMN reply_to_id TYPE VARCHAR(255)
  `.execute(db);

  // Add an index on reply_to_id for better query performance
  await db.schema
    .createIndex('idx_messages_reply_to_id')
    .on('messages')
    .column('reply_to_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop the index
  await db.schema.dropIndex('idx_messages_reply_to_id').execute();

  // Note: We cannot easily revert this migration because converting
  // varchar platform IDs back to UUIDs would require data transformation
  // This is a breaking change that should not be reverted
  throw new Error(
    'Cannot revert this migration - it changes data types in a non-reversible way'
  );
}
