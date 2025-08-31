import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Create ocr_results table for versioned OCR text extraction results
  await db.schema
    .createTable('ocr_results')
    .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
    .addColumn('attachment_id', 'varchar(36)', (col) =>
      col.notNull().references('message_attachments.id').onDelete('cascade')
    )
    .addColumn('model_version', 'varchar(50)', (col) => col.notNull())
    .addColumn('extracted_text', 'text')
    .addColumn('confidence', sql`decimal(3,2)` as any)
    .addColumn('status', 'varchar(20)', (col) => col.notNull())
    .addColumn('error_message', 'text')
    .addColumn('retry_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('processing_time_ms', 'integer')
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
    .createIndex('idx_ocr_results_attachment_latest')
    .on('ocr_results')
    .columns(['attachment_id', 'created_at'])
    .execute();

  await db.schema
    .createIndex('idx_ocr_results_status')
    .on('ocr_results')
    .column('status')
    .execute();

  // Add CHECK constraint for status values
  await sql`
    ALTER TABLE ocr_results 
    ADD CONSTRAINT check_ocr_status 
    CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
  `.execute(db);

  // Add CHECK constraint for confidence score
  await sql`
    ALTER TABLE ocr_results 
    ADD CONSTRAINT check_ocr_confidence 
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop the ocr_results table
  await db.schema.dropTable('ocr_results').execute();
}