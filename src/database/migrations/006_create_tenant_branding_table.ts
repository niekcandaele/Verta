import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('tenant_branding')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('tenant_id', 'uuid', (col) => col.notNull())
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
      col.notNull().defaultTo(sql`now()`)
    )
    .addColumn('updated_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`now()`)
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

  // Add CHECK constraints to validate hex color format
  await sql`
    ALTER TABLE tenant_branding 
    ADD CONSTRAINT check_primary_color_format 
    CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$')
  `.execute(db);

  await sql`
    ALTER TABLE tenant_branding 
    ADD CONSTRAINT check_secondary_color_format 
    CHECK (secondary_color ~ '^#[0-9A-Fa-f]{6}$')
  `.execute(db);

  await sql`
    ALTER TABLE tenant_branding 
    ADD CONSTRAINT check_accent_color_format 
    CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$')
  `.execute(db);

  // Create trigger to automatically update updated_at
  await sql`
    CREATE TRIGGER update_tenant_branding_updated_at 
    BEFORE UPDATE ON tenant_branding 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop trigger
  await sql`DROP TRIGGER IF EXISTS update_tenant_branding_updated_at ON tenant_branding`.execute(
    db
  );

  // Drop constraints
  await sql`ALTER TABLE tenant_branding DROP CONSTRAINT IF EXISTS check_accent_color_format`.execute(
    db
  );
  await sql`ALTER TABLE tenant_branding DROP CONSTRAINT IF EXISTS check_secondary_color_format`.execute(
    db
  );
  await sql`ALTER TABLE tenant_branding DROP CONSTRAINT IF EXISTS check_primary_color_format`.execute(
    db
  );

  // Drop indexes
  await db.schema.dropIndex('idx_tenant_branding_tenant_id').execute();

  // Drop table
  await db.schema.dropTable('tenant_branding').execute();
}
