import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('tenant_branding')
    .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
    .addColumn('tenant_id', 'varchar(36)', (col) => col.notNull())
    .addColumn('logo', 'text', (col) => col)
    .addColumn('primary_color', 'varchar(7)', (col) =>
      col.notNull().defaultTo('#3b82f6')
    )
    .addColumn('secondary_color', 'varchar(7)', (col) =>
      col.notNull().defaultTo('#64748b')
    )
    .addColumn('accent_color', 'varchar(7)', (col) =>
      col.notNull().defaultTo('#10b981')
    )
    .addColumn('created_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('updated_at', 'timestamp', (col) =>
      col
        .notNull()
        .defaultTo(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
    )
    .execute();

  // Add foreign key constraint to tenants table
  await sql`
    ALTER TABLE tenant_branding 
    ADD CONSTRAINT tenant_branding_tenant_id_fkey 
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  `.execute(db);

  // Create unique index on tenant_id (one branding config per tenant)
  await db.schema
    .createIndex('idx_tenant_branding_tenant_id')
    .on('tenant_branding')
    .column('tenant_id')
    .unique()
    .execute();

  // Add CHECK constraints to validate hex color format (MySQL REGEXP syntax)
  await sql`
    ALTER TABLE tenant_branding 
    ADD CONSTRAINT check_primary_color_format 
    CHECK (primary_color REGEXP '^#[0-9A-Fa-f]{6}$')
  `.execute(db);

  await sql`
    ALTER TABLE tenant_branding 
    ADD CONSTRAINT check_secondary_color_format 
    CHECK (secondary_color REGEXP '^#[0-9A-Fa-f]{6}$')
  `.execute(db);

  await sql`
    ALTER TABLE tenant_branding 
    ADD CONSTRAINT check_accent_color_format 
    CHECK (accent_color REGEXP '^#[0-9A-Fa-f]{6}$')
  `.execute(db);

  // Note: MySQL handles updated_at automatically with ON UPDATE CURRENT_TIMESTAMP
  // No need for a separate trigger
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop constraints
  // Note: MySQL doesn't support DROP CONSTRAINT syntax, constraints are dropped with table

  // Drop indexes
  await db.schema.dropIndex('idx_tenant_branding_tenant_id').execute();

  // Drop table
  await db.schema.dropTable('tenant_branding').execute();
}
