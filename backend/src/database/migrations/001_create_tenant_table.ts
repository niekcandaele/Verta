import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('tenants')
    .addColumn('id', 'varchar(36)', (col) =>
      col.primaryKey()
    )
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('slug', 'varchar(255)', (col) => col.notNull())
    .addColumn('status', 'varchar(20)', (col) =>
      col.notNull().defaultTo('ACTIVE')
    )
    .addColumn('platform', 'varchar(20)', (col) => col.notNull())
    .addColumn('platform_id', 'varchar(255)', (col) => col.notNull())
    .addColumn('created_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('updated_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
    )
    .execute();

  // Add CHECK constraints for enums (MySQL 8.0.16+ supports CHECK constraints)
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

  // Note: MySQL handles updated_at automatically with ON UPDATE CURRENT_TIMESTAMP
  // No need for a separate trigger
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop indexes
  await db.schema.dropIndex('idx_tenants_created_at').execute();
  await db.schema.dropIndex('idx_tenants_status').execute();
  await db.schema.dropIndex('idx_tenants_platform_platform_id').execute();
  await db.schema.dropIndex('idx_tenants_slug').execute();

  // Drop table
  await db.schema.dropTable('tenants').execute();
}
