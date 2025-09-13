import { Kysely } from 'kysely';
import { Database } from '../types.js';

/**
 * Add description column to knowledge_bases table
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable('knowledge_bases')
    .addColumn('description', 'text')
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable('knowledge_bases')
    .dropColumn('description')
    .execute();
}