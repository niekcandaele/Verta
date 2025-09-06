import { Kysely, sql } from 'kysely';
import { Database } from '../types.js';

/**
 * Add HNSW vector indexes for efficient similarity search
 * TiDB Serverless supports vector indexes without requiring TiFlash
 */
export async function up(db: Kysely<Database>): Promise<void> {
  // Add HNSW vector index for messages table
  try {
    await sql`
      ALTER TABLE messages 
      ADD VECTOR INDEX idx_messages_embedding ((VEC_COSINE_DISTANCE(embedding)))
      ADD_COLUMNAR_REPLICA_ON_DEMAND
    `.execute(db);
    console.log('Successfully created vector index on messages table');
  } catch (error: any) {
    if (error?.code === 'ER_DUP_KEYNAME') {
      console.log('Vector index on messages table already exists, skipping');
    } else {
      console.warn('Warning: Could not create vector index on messages table:', error?.message || error);
      // Continue without failing the migration
    }
  }

  // Add HNSW vector index for golden_answers table
  try {
    await sql`
      ALTER TABLE golden_answers
      ADD VECTOR INDEX idx_golden_answers_embedding ((VEC_COSINE_DISTANCE(embedding)))
      ADD_COLUMNAR_REPLICA_ON_DEMAND
    `.execute(db);
    console.log('Successfully created vector index on golden_answers table');
  } catch (error: any) {
    if (error?.code === 'ER_DUP_KEYNAME') {
      console.log('Vector index on golden_answers table already exists, skipping');
    } else {
      console.warn('Warning: Could not create vector index on golden_answers table:', error?.message || error);
      // Continue without failing the migration
    }
  }
}

export async function down(db: Kysely<Database>): Promise<void> {
  // Drop vector index from messages table
  await sql`
    ALTER TABLE messages 
    DROP INDEX idx_messages_embedding
  `.execute(db);

  // Drop vector index from golden_answers table
  await sql`
    ALTER TABLE golden_answers
    DROP INDEX idx_golden_answers_embedding
  `.execute(db);
}