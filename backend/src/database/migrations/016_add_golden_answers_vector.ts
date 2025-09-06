import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Add vector column to golden_answers table
  await sql`
    ALTER TABLE golden_answers 
    ADD COLUMN embedding VECTOR(1024)
  `.execute(db);

  // Note: Vector indexes require TiFlash which is not available in our simple Docker setup
  // In production with TiFlash, you would create the index like this:
  // await sql`
  //   ALTER TABLE golden_answers
  //   ADD VECTOR INDEX idx_golden_answers_embedding ((VEC_COSINE_DISTANCE(embedding)))
  // `.execute(db);

  // Add index for filtering golden answers without embeddings
  await db.schema
    .createIndex('idx_golden_answers_embedding_null')
    .on('golden_answers')
    .expression(sql`(CASE WHEN embedding IS NULL THEN 1 ELSE NULL END)`)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop the index first
  await db.schema
    .dropIndex('idx_golden_answers_embedding_null')
    .on('golden_answers')
    .execute();

  // Drop the vector column
  await sql`
    ALTER TABLE golden_answers 
    DROP COLUMN embedding
  `.execute(db);
}