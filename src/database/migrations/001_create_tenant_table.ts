import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('tenants')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('slug', 'varchar(255)', (col) => col.notNull())
    .addColumn('status', 'varchar(20)', (col) =>
      col.notNull().defaultTo('ACTIVE')
    )
    .addColumn('platform', 'varchar(20)', (col) => col.notNull())
    .addColumn('platform_id', 'varchar(255)', (col) => col.notNull())
    .addColumn('created_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addColumn('updated_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  // Add CHECK constraints for enums
  await sql`
    ALTER TABLE tenants 
    ADD CONSTRAINT check_tenant_status 
    CHECK (status IN ('ACTIVE', 'CANCELLED', 'MAINTENANCE'))
  `.execute(db);

  await sql`
    ALTER TABLE tenants 
    ADD CONSTRAINT check_platform 
    CHECK (platform IN ('slack', 'discord'))
  `.execute(db);

  // Create indexes
  await db.schema
    .createIndex('idx_tenants_slug')
    .on('tenants')
    .column('slug')
    .unique()
    .execute();

  await db.schema
    .createIndex('idx_tenants_platform_platform_id')
    .on('tenants')
    .columns(['platform', 'platform_id'])
    .unique()
    .execute();

  await db.schema
    .createIndex('idx_tenants_status')
    .on('tenants')
    .column('status')
    .execute();

  await db.schema
    .createIndex('idx_tenants_created_at')
    .on('tenants')
    .column('created_at')
    .execute();

  // Create trigger to automatically update updated_at
  await sql`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `.execute(db);

  await sql`
    CREATE TRIGGER update_tenants_updated_at 
    BEFORE UPDATE ON tenants 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop trigger and function
  await sql`DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants`.execute(
    db
  );
  await sql`DROP FUNCTION IF EXISTS update_updated_at_column`.execute(db);

  // Drop indexes
  await db.schema.dropIndex('idx_tenants_created_at').execute();
  await db.schema.dropIndex('idx_tenants_status').execute();
  await db.schema.dropIndex('idx_tenants_platform_platform_id').execute();
  await db.schema.dropIndex('idx_tenants_slug').execute();

  // Drop table
  await db.schema.dropTable('tenants').execute();
}
