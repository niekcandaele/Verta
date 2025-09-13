import { Kysely } from 'kysely';

/**
 * Add last_crawl_event column to track any crawl activity
 * This replaces the complex monitoring system with a simple timestamp
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('knowledge_bases')
    .addColumn('last_crawl_event', 'timestamp')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('knowledge_bases')
    .dropColumn('last_crawl_event')
    .execute();
}