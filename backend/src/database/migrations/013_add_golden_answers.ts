import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Create golden_answers table
  await db.schema
    .createTable('golden_answers')
    .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
    .addColumn('cluster_id', 'varchar(36)', (col) =>
      col.notNull().references('question_clusters.id').onDelete('cascade')
    )
    .addColumn('tenant_id', 'varchar(36)', (col) =>
      col.notNull().references('tenants.id').onDelete('cascade')
    )
    .addColumn('answer', 'text', (col) => col.notNull())
    .addColumn('answer_format', 'varchar(20)', (col) =>
      col.notNull().defaultTo('markdown')
    )
    .addColumn('created_by', 'varchar(255)', (col) => col.notNull())
    .addColumn('created_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('updated_at', 'timestamp', (col) =>
      col
        .notNull()
        .defaultTo(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
    )
    .execute();

  // Add unique constraint for one answer per cluster
  await db.schema
    .createIndex('idx_golden_answers_cluster_unique')
    .on('golden_answers')
    .column('cluster_id')
    .unique()
    .execute();

  // Add index for tenant-specific queries
  await db.schema
    .createIndex('idx_golden_answers_tenant')
    .on('golden_answers')
    .column('tenant_id')
    .execute();

  // Add CHECK constraint for answer format
  await sql`
    ALTER TABLE golden_answers 
    ADD CONSTRAINT check_answer_format 
    CHECK (answer_format IN ('markdown', 'plaintext'))
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop table (indexes and constraints will be dropped automatically)
  await db.schema.dropTable('golden_answers').execute();
}
