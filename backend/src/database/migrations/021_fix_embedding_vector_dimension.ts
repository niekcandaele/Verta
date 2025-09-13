import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Drop the existing vector index
  await sql`DROP INDEX idx_kb_chunks_embedding ON knowledge_base_chunks`.execute(db);
  
  // Alter the embedding column to use 1024 dimensions (matching BGE-M3 model)
  await sql`ALTER TABLE knowledge_base_chunks MODIFY COLUMN embedding VECTOR(1024)`.execute(db);
  
  // Recreate the vector index with the new dimension
  await sql`CREATE VECTOR INDEX idx_kb_chunks_embedding ON knowledge_base_chunks ((VEC_COSINE_DISTANCE(embedding)))`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop the vector index
  await sql`DROP INDEX idx_kb_chunks_embedding ON knowledge_base_chunks`.execute(db);
  
  // Revert to 1536 dimensions
  await sql`ALTER TABLE knowledge_base_chunks MODIFY COLUMN embedding VECTOR(1536)`.execute(db);
  
  // Recreate the vector index
  await sql`CREATE VECTOR INDEX idx_kb_chunks_embedding ON knowledge_base_chunks ((VEC_COSINE_DISTANCE(embedding)))`.execute(db);
}