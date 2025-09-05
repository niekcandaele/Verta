import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Drop the incorrect foreign key constraint that references messages
  await sql`
    ALTER TABLE question_instances 
    DROP FOREIGN KEY fk_questions_thread_id
  `.execute(db);

  // Add the correct foreign key constraint to reference channels (threads)
  await sql`
    ALTER TABLE question_instances
    ADD CONSTRAINT fk_question_instances_thread_id
    FOREIGN KEY (thread_id) REFERENCES channels(id)
    ON DELETE CASCADE
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // Revert: Drop the correct constraint
  await sql`
    ALTER TABLE question_instances 
    DROP FOREIGN KEY fk_question_instances_thread_id
  `.execute(db);

  // Revert: Add back the incorrect constraint (for rollback purposes)
  await sql`
    ALTER TABLE question_instances
    ADD CONSTRAINT fk_questions_thread_id
    FOREIGN KEY (thread_id) REFERENCES messages(id)
    ON DELETE CASCADE
  `.execute(db);
}