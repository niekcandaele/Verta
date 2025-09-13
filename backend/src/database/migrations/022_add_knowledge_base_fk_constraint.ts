import { Kysely, sql } from 'kysely';
import { Database } from '../types.js';

/**
 * Add proper foreign key constraint to knowledge_bases.tenant_id
 * First clean up invalid data, then add the constraint
 */
export async function up(db: Kysely<Database>): Promise<void> {
  // First, delete all knowledge_base_chunks that belong to knowledge bases with invalid tenant_id
  console.log('Cleaning up knowledge_base_chunks with invalid tenant references...');
  await sql`
    DELETE FROM knowledge_base_chunks 
    WHERE knowledge_base_id IN (
      SELECT kb.id 
      FROM knowledge_bases kb
      LEFT JOIN tenants t ON kb.tenant_id = t.id
      WHERE t.id IS NULL
    )
  `.execute(db);

  // Then delete all knowledge_bases with invalid tenant_id
  console.log('Cleaning up knowledge_bases with invalid tenant references...');
  await sql`
    DELETE FROM knowledge_bases 
    WHERE tenant_id NOT IN (SELECT id FROM tenants)
  `.execute(db);

  // Now add the foreign key constraint
  console.log('Adding foreign key constraint to knowledge_bases.tenant_id...');
  await sql`
    ALTER TABLE knowledge_bases 
    ADD CONSTRAINT fk_knowledge_bases_tenant_id 
    FOREIGN KEY (tenant_id) 
    REFERENCES tenants(id) 
    ON DELETE CASCADE
  `.execute(db);

  console.log('Successfully added foreign key constraint to knowledge_bases table');
}

export async function down(db: Kysely<Database>): Promise<void> {
  // Drop the foreign key constraint
  await sql`
    ALTER TABLE knowledge_bases 
    DROP FOREIGN KEY fk_knowledge_bases_tenant_id
  `.execute(db);
}