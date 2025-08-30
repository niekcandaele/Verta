import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Create channel_sync_jobs table
  await db.schema
    .createTable('channel_sync_jobs')
    .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
    .addColumn('tenant_id', 'varchar(36)', (col) =>
      col.notNull().references('tenants.id').onDelete('cascade')
    )
    .addColumn('channel_id', 'varchar(36)', (col) =>
      col.notNull().references('channels.id').onDelete('cascade')
    )
    .addColumn('parent_job_id', 'varchar(255)', (col) => col.notNull())
    .addColumn('worker_id', 'varchar(50)')
    .addColumn('status', 'varchar(50)', (col) => col.notNull())
    .addColumn('started_at', 'timestamp')
    .addColumn('completed_at', 'timestamp')
    .addColumn('messages_processed', 'integer', (col) => col.defaultTo(0))
    .addColumn('error_details', 'json')
    .addColumn('created_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('updated_at', 'timestamp', (col) =>
      col
        .notNull()
        .defaultTo(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
    )
    .execute();

  // Add CHECK constraint for status
  await sql`
    ALTER TABLE channel_sync_jobs 
    ADD CONSTRAINT check_channel_sync_job_status 
    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed'))
  `.execute(db);

  // Create indexes for channel_sync_jobs
  await db.schema
    .createIndex('idx_channel_sync_jobs_tenant')
    .on('channel_sync_jobs')
    .column('tenant_id')
    .execute();

  await db.schema
    .createIndex('idx_channel_sync_jobs_parent')
    .on('channel_sync_jobs')
    .column('parent_job_id')
    .execute();

  await db.schema
    .createIndex('idx_channel_sync_jobs_worker')
    .on('channel_sync_jobs')
    .columns(['worker_id', 'status'])
    .execute();

  // Update sync_progress table
  await db.schema
    .alterTable('sync_progress')
    .addColumn('worker_id', 'varchar(50)')
    .addColumn('started_at', 'timestamp')
    .addColumn('messages_per_second', 'decimal')
    .execute();

  // Add index for worker queries on sync_progress
  await db.schema
    .createIndex('idx_sync_progress_worker')
    .on('sync_progress')
    .columns(['worker_id', 'status'])
    .execute();

  // Note: MySQL handles updated_at automatically with ON UPDATE CURRENT_TIMESTAMP
  // No need for a separate trigger
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop indexes from sync_progress
  await db.schema.dropIndex('idx_sync_progress_worker').execute();

  // Remove columns from sync_progress
  await db.schema
    .alterTable('sync_progress')
    .dropColumn('worker_id')
    .dropColumn('started_at')
    .dropColumn('messages_per_second')
    .execute();

  // Drop indexes from channel_sync_jobs
  await db.schema.dropIndex('idx_channel_sync_jobs_worker').execute();
  await db.schema.dropIndex('idx_channel_sync_jobs_parent').execute();
  await db.schema.dropIndex('idx_channel_sync_jobs_tenant').execute();

  // Drop channel_sync_jobs table
  await db.schema.dropTable('channel_sync_jobs').execute();
}
