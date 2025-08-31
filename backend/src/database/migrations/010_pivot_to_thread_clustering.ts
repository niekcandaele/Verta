import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Add thread support columns to question_clusters table
  await db.schema
    .alterTable('question_clusters')
    .addColumn('thread_title', 'varchar(255)')
    .execute();

  // Drop the existing question_instances table to rebuild with thread support
  await db.schema.dropTable('question_instances').execute();

  // Recreate question_instances table with thread-based structure
  await db.schema
    .createTable('question_instances')
    .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
    .addColumn('cluster_id', 'varchar(36)', (col) =>
      col.notNull().references('question_clusters.id').onDelete('cascade')
    )
    .addColumn('thread_id', 'varchar(36)', (col) =>
      col.notNull().references('channels.id').onDelete('cascade')
    )
    .addColumn('thread_title', 'varchar(255)')
    .addColumn('original_text', 'text', (col) => col.notNull())
    .addColumn('rephrased_text', 'text')
    .addColumn('confidence_score', sql`decimal(3,2)` as any, (col) =>
      col.notNull()
    )
    .addColumn('created_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .execute();

  // Add indexes for the new structure
  await db.schema
    .createIndex('idx_question_instances_cluster_id')
    .on('question_instances')
    .column('cluster_id')
    .execute();

  await db.schema
    .createIndex('idx_question_instances_thread_id')
    .on('question_instances')
    .column('thread_id')
    .unique()
    .execute();

  // Add CHECK constraint for confidence score
  await sql`
    ALTER TABLE question_instances 
    ADD CONSTRAINT check_confidence_score 
    CHECK (confidence_score >= 0 AND confidence_score <= 1)
  `.execute(db);

  // Add parameters column to analysis_jobs for thread processing configuration
  await db.schema
    .alterTable('analysis_jobs')
    .addColumn('thread_min_age_days', 'integer', (col) => col.defaultTo(5))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Remove thread_min_age_days from analysis_jobs
  await db.schema
    .alterTable('analysis_jobs')
    .dropColumn('thread_min_age_days')
    .execute();

  // Drop the thread-based question_instances table
  await db.schema.dropTable('question_instances').execute();

  // Recreate the original message-based question_instances table
  await db.schema
    .createTable('question_instances')
    .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
    .addColumn('cluster_id', 'varchar(36)', (col) =>
      col.notNull().references('question_clusters.id').onDelete('cascade')
    )
    .addColumn('message_id', 'varchar(36)', (col) =>
      col.notNull().references('messages.id').onDelete('cascade')
    )
    .addColumn('original_text', 'text', (col) => col.notNull())
    .addColumn('context_messages', 'json')
    .addColumn('rephrased_text', 'text')
    .addColumn('confidence_score', sql`decimal(3,2)` as any, (col) =>
      col.notNull()
    )
    .addColumn('created_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .execute();

  // Recreate original indexes
  await db.schema
    .createIndex('idx_question_instances_cluster_id')
    .on('question_instances')
    .column('cluster_id')
    .execute();

  await db.schema
    .createIndex('idx_question_instances_message_id')
    .on('question_instances')
    .column('message_id')
    .unique()
    .execute();

  // Add back CHECK constraint
  await sql`
    ALTER TABLE question_instances 
    ADD CONSTRAINT check_confidence_score 
    CHECK (confidence_score >= 0 AND confidence_score <= 1)
  `.execute(db);

  // Remove thread_title from question_clusters
  await db.schema
    .alterTable('question_clusters')
    .dropColumn('thread_title')
    .execute();
}
