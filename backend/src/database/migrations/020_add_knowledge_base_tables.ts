import { Kysely, sql } from 'kysely';
import { Database } from '../types.js';

/**
 * Add knowledge_bases and knowledge_base_chunks tables for external documentation crawling
 */
export async function up(db: Kysely<Database>): Promise<void> {
  // Create knowledge_bases table
  await db.schema
    .createTable('knowledge_bases')
    .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
    .addColumn('tenant_id', 'varchar(36)', (col) =>
      col.notNull().references('tenants.id').onDelete('cascade')
    )
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('sitemap_url', 'varchar(2048)', (col) => col.notNull())
    .addColumn('last_crawled_at', 'timestamp')
    .addColumn('status', 'varchar(20)', (col) => 
      col.notNull().defaultTo('active')
    )
    .addColumn('created_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('updated_at', 'timestamp', (col) =>
      col
        .notNull()
        .defaultTo(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
    )
    .execute();

  // console.log('Successfully created knowledge_bases table');

  // Add index for tenant queries
  await db.schema
    .createIndex('idx_knowledge_bases_tenant')
    .on('knowledge_bases')
    .column('tenant_id')
    .execute();

  // Add CHECK constraint for status
  await sql`
    ALTER TABLE knowledge_bases 
    ADD CONSTRAINT check_kb_status 
    CHECK (status IN ('active', 'inactive', 'processing', 'failed'))
  `.execute(db);

  // Create knowledge_base_chunks table
  await db.schema
    .createTable('knowledge_base_chunks')
    .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
    .addColumn('knowledge_base_id', 'varchar(36)', (col) =>
      col.notNull().references('knowledge_bases.id').onDelete('cascade')
    )
    .addColumn('source_url', 'varchar(2048)', (col) => col.notNull())
    .addColumn('title', 'varchar(1024)')
    .addColumn('heading_hierarchy', 'json')
    .addColumn('content', 'text', (col) => col.notNull())
    .addColumn('chunk_index', 'integer', (col) => col.notNull())
    .addColumn('total_chunks', 'integer', (col) => col.notNull())
    .addColumn('start_char_index', 'integer')
    .addColumn('end_char_index', 'integer')
    .addColumn('overlap_with_previous', 'integer', (col) => col.defaultTo(0))
    .addColumn('checksum', 'varchar(64)')
    .addColumn('chunk_method', 'varchar(20)', (col) =>
      col.notNull().defaultTo('semantic')
    )
    .addColumn('token_count', 'integer')
    .addColumn('created_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('updated_at', 'timestamp', (col) =>
      col
        .notNull()
        .defaultTo(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
    )
    .execute();

  // console.log('Successfully created knowledge_base_chunks table');

  // Add embedding column separately using raw SQL (VECTOR type)
  await sql`
    ALTER TABLE knowledge_base_chunks 
    ADD COLUMN embedding VECTOR(1536)
  `.execute(db);

  // console.log('Successfully added embedding column to knowledge_base_chunks');

  // Add indexes for knowledge_base_chunks
  await db.schema
    .createIndex('idx_kb_chunks_kb_id')
    .on('knowledge_base_chunks')
    .column('knowledge_base_id')
    .execute();

  // Use raw SQL for source_url index with prefix length
  await sql`
    CREATE INDEX idx_kb_chunks_source_url 
    ON knowledge_base_chunks(source_url(768))
  `.execute(db);

  // Add HNSW vector index for similarity search
  await sql`
    ALTER TABLE knowledge_base_chunks 
    ADD VECTOR INDEX idx_kb_chunks_embedding ((VEC_COSINE_DISTANCE(embedding)))
    ADD_COLUMNAR_REPLICA_ON_DEMAND
  `.execute(db);

  // console.log('Successfully created vector index on knowledge_base_chunks');

  // Add CHECK constraint for chunk_method
  await sql`
    ALTER TABLE knowledge_base_chunks 
    ADD CONSTRAINT check_chunk_method 
    CHECK (chunk_method IN ('semantic', 'fixed_size', 'structural'))
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  // Drop tables (indexes and constraints will be dropped automatically)
  await db.schema.dropTable('knowledge_base_chunks').execute();
  await db.schema.dropTable('knowledge_bases').execute();
  
  // console.log('Successfully dropped knowledge base tables');
}