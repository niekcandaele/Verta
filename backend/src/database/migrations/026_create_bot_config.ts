import { Kysely, sql } from 'kysely';

/**
 * Create bot_config table for Discord bot channel monitoring configuration
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('bot_config')
    .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
    .addColumn('tenant_id', 'varchar(36)', (col) => col.notNull())
    .addColumn('monitored_channels', 'json', (col) => col.notNull())
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
  await db.schema
    .alterTable('bot_config')
    .addForeignKeyConstraint(
      'bot_config_tenant_id_fkey',
      ['tenant_id'],
      'tenants',
      ['id'],
      (cb) => cb.onDelete('cascade')
    )
    .execute();

  // Add unique constraint on tenant_id (one config per tenant)
  await db.schema
    .alterTable('bot_config')
    .addUniqueConstraint('bot_config_tenant_id_unique', ['tenant_id'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('bot_config').execute();
}