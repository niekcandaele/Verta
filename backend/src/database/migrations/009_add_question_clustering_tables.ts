import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Create question_clusters table with vector support
  await db.schema
    .createTable('question_clusters')
    .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
    .addColumn('tenant_id', 'varchar(36)', (col) =>
      col.notNull().references('tenants.id').onDelete('cascade')
    )
    .addColumn('representative_text', 'text', (col) => col.notNull())
    .addColumn('embedding', sql`vector(1024)` as any, (col) => col.notNull())
    .addColumn('instance_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('first_seen_at', 'timestamp', (col) => col.notNull())
    .addColumn('last_seen_at', 'timestamp', (col) => col.notNull())
    .addColumn('metadata', 'json')
    .addColumn('created_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('updated_at', 'timestamp', (col) =>
      col
        .notNull()
        .defaultTo(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
    )
    .execute();

  // Note: Vector indexes require TiFlash which is not available in our simple Docker setup
  // In production with TiFlash, you would create the index like this:
  // await sql`
  //   ALTER TABLE question_clusters
  //   ADD VECTOR INDEX idx_question_clusters_embedding ((VEC_COSINE_DISTANCE(embedding)))
  // `.execute(db);

  // Create question_instances table
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

  // Create analysis_jobs table for tracking processing jobs
  await db.schema
    .createTable('analysis_jobs')
    .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
    .addColumn('tenant_id', 'varchar(36)', (col) =>
      col.notNull().references('tenants.id').onDelete('cascade')
    )
    .addColumn('status', 'varchar(20)', (col) => col.notNull())
    .addColumn('job_type', 'varchar(50)', (col) =>
      col.notNull().defaultTo('question_clustering')
    )
    .addColumn('parameters', 'json')
    .addColumn('progress', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('total_items', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('processed_items', 'integer', (col) =>
      col.notNull().defaultTo(0)
    )
    .addColumn('error_details', 'json')
    .addColumn('started_at', 'timestamp')
    .addColumn('completed_at', 'timestamp')
    .addColumn('created_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('updated_at', 'timestamp', (col) =>
      col
        .notNull()
        .defaultTo(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
    )
    .execute();

  // Add indexes for performance
  await db.schema
    .createIndex('idx_question_clusters_tenant_id')
    .on('question_clusters')
    .column('tenant_id')
    .execute();

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

  await db.schema
    .createIndex('idx_analysis_jobs_tenant_status')
    .on('analysis_jobs')
    .columns(['tenant_id', 'status'])
    .execute();

  // Add CHECK constraint for analysis job status
  await sql`
    ALTER TABLE analysis_jobs 
    ADD CONSTRAINT check_analysis_job_status 
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'))
  `.execute(db);

  // Add CHECK constraint for confidence score
  await sql`
    ALTER TABLE question_instances 
    ADD CONSTRAINT check_confidence_score 
    CHECK (confidence_score >= 0 AND confidence_score <= 1)
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop tables in reverse order to handle foreign key constraints
  await db.schema.dropTable('question_instances').execute();
  await db.schema.dropTable('analysis_jobs').execute();
  await db.schema.dropTable('question_clusters').execute();
}
