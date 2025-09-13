import { Kysely } from 'kysely';

/**
 * Remove status column from knowledge bases table
 * Knowledge bases don't need a status - they're either present or not
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // Drop the status column
  await db.schema
    .alterTable('knowledge_bases')
    .dropColumn('status')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Add the status column back with default value
  await db.schema
    .alterTable('knowledge_bases')
    .addColumn('status', 'varchar(20)', (col) => 
      col.notNull().defaultTo('active')
    )
    .execute();
  
  // Add back the index on status
  await db.schema
    .createIndex('idx_knowledge_bases_status')
    .on('knowledge_bases')
    .column('status')
    .execute();
}