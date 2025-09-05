import { Kysely } from 'kysely';

/**
 * Add performance indexes for FAQ and admin queries
 */
export async function up(db: Kysely<any>): Promise<void> {
  // Composite index for FAQ query optimization
  // Speeds up: WHERE tenant_id = ? ORDER BY instance_count DESC
  await db.schema
    .createIndex('idx_clusters_tenant_instance')
    .on('question_clusters')
    .columns(['tenant_id', 'instance_count'])
    .execute();

  // Index for sorting by last_seen_at
  await db.schema
    .createIndex('idx_clusters_last_seen')
    .on('question_clusters')
    .column('last_seen_at')
    .execute();

  // Index for golden answers joined queries
  // Already have unique index on cluster_id, add tenant_id for filtering
  await db.schema
    .createIndex('idx_golden_answers_tenant_cluster')
    .on('golden_answers')
    .columns(['tenant_id', 'cluster_id'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex('idx_clusters_tenant_instance')
    .on('question_clusters')
    .execute();

  await db.schema
    .dropIndex('idx_clusters_last_seen')
    .on('question_clusters')
    .execute();

  await db.schema
    .dropIndex('idx_golden_answers_tenant_cluster')
    .on('golden_answers')
    .execute();
}