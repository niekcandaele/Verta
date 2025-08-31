import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // The following constraints already exist with CASCADE DELETE:
  // - fk_messages_channel_id: messages -> channels
  // - fk_attachments_message_id: message_attachments -> messages  
  // - fk_reactions_message_id: message_emoji_reactions -> messages
  
  // Clean up any orphaned OCR results before adding constraint
  await sql`
    DELETE ocr FROM ocr_results ocr
    LEFT JOIN message_attachments ma ON ma.id = ocr.attachment_id
    WHERE ma.id IS NULL
  `.execute(db);
  
  // Add missing foreign key constraint: ocr_results -> message_attachments (CASCADE DELETE)
  await sql`
    ALTER TABLE ocr_results 
    ADD CONSTRAINT fk_ocr_attachment_id 
    FOREIGN KEY (attachment_id) 
    REFERENCES message_attachments(id) 
    ON DELETE CASCADE
  `.execute(db);

  // Add foreign key constraint: question_instances -> messages (CASCADE DELETE)
  // thread_id references message id
  await sql`
    ALTER TABLE question_instances 
    ADD CONSTRAINT fk_questions_thread_id 
    FOREIGN KEY (thread_id) 
    REFERENCES messages(id) 
    ON DELETE CASCADE
  `.execute(db);

  // Add foreign key constraint: question_instances -> question_clusters (CASCADE DELETE)
  await sql`
    ALTER TABLE question_instances 
    ADD CONSTRAINT fk_questions_cluster_id 
    FOREIGN KEY (cluster_id) 
    REFERENCES question_clusters(id) 
    ON DELETE CASCADE
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop foreign key constraints added in this migration
  await sql`ALTER TABLE question_instances DROP FOREIGN KEY fk_questions_cluster_id`.execute(db);
  await sql`ALTER TABLE question_instances DROP FOREIGN KEY fk_questions_thread_id`.execute(db);
  await sql`ALTER TABLE ocr_results DROP FOREIGN KEY fk_ocr_attachment_id`.execute(db);
}