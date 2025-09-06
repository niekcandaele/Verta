import { Kysely, sql } from 'kysely';
import { Database } from '../types.js';

/**
 * Add vector column to messages table for full-text search
 */
export async function up(db: Kysely<Database>): Promise<void> {
  // Add vector column to messages table
  await sql`
    ALTER TABLE messages 
    ADD COLUMN embedding VECTOR(1024)
  `.execute(db);

  // Add index for efficient filtering of messages with embeddings
  await sql`
    CREATE INDEX idx_messages_channel_embedding 
    ON messages(channel_id, (embedding IS NOT NULL))
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  // Drop the index first
  await sql`
    DROP INDEX IF EXISTS idx_messages_channel_embedding
  `.execute(db);

  // Remove the vector column
  await sql`
    ALTER TABLE messages 
    DROP COLUMN embedding
  `.execute(db);
}