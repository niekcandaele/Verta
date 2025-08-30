import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // First, try to drop the foreign key constraint on reply_to_id
  // MySQL doesn't support IF EXISTS for DROP FOREIGN KEY, so we catch the error
  try {
    await sql`
      ALTER TABLE messages 
      DROP FOREIGN KEY messages_reply_to_id_fkey
    `.execute(db);
  } catch (error: any) {
    // Ignore error if foreign key doesn't exist
    if (!error.message?.includes('check that column/key exists')) {
      throw error;
    }
  }

  // Drop any messages that have reply_to_id set (if any exist)
  // This is necessary because we're changing the column type
  await sql`
    DELETE FROM messages WHERE reply_to_id IS NOT NULL
  `.execute(db);

  // Change the column type from varchar(36) to varchar(255) (MySQL syntax)
  await sql`
    ALTER TABLE messages 
    MODIFY COLUMN reply_to_id VARCHAR(255)
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
