import { Kysely, sql } from 'kysely';
import { Database } from '../types.js';

/**
 * Add missing foreign key constraint to knowledge_base_chunks.knowledge_base_id
 * This ensures referential integrity and prevents orphaned chunks
 */
export async function up(db: Kysely<Database>): Promise<void> {
  // First, log the current state
  console.log('Checking for orphaned knowledge_base_chunks...');
  
  const orphanedChunks = await sql<{ count: number }>`
    SELECT COUNT(*) as count
    FROM knowledge_base_chunks kbc
    LEFT JOIN knowledge_bases kb ON kbc.knowledge_base_id = kb.id
    WHERE kb.id IS NULL
  `.execute(db);

  console.log(`Found ${orphanedChunks.rows[0].count} orphaned chunks`);

  // Clean up any orphaned chunks (chunks pointing to non-existent knowledge bases)
  if (orphanedChunks.rows[0].count > 0) {
    console.log('Cleaning up orphaned knowledge_base_chunks...');
    await sql`
      DELETE FROM knowledge_base_chunks 
      WHERE knowledge_base_id NOT IN (SELECT id FROM knowledge_bases)
    `.execute(db);
    console.log('Orphaned chunks cleaned up');
  }

  // Now add the foreign key constraint
  console.log('Adding foreign key constraint to knowledge_base_chunks.knowledge_base_id...');
  await sql`
    ALTER TABLE knowledge_base_chunks 
    ADD CONSTRAINT fk_knowledge_base_chunks_kb_id 
    FOREIGN KEY (knowledge_base_id) 
    REFERENCES knowledge_bases(id) 
    ON DELETE CASCADE
  `.execute(db);

  console.log('Successfully added foreign key constraint to knowledge_base_chunks table');
}

export async function down(db: Kysely<Database>): Promise<void> {
  // Drop the foreign key constraint
  await sql`
    ALTER TABLE knowledge_base_chunks 
    DROP FOREIGN KEY fk_knowledge_base_chunks_kb_id
  `.execute(db);
  
  console.log('Dropped foreign key constraint from knowledge_base_chunks table');
}