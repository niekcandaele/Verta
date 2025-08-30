import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Create channels table
  await db.schema
    .createTable('channels')
    .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
    .addColumn('tenant_id', 'varchar(36)', (col) =>
      col.notNull().references('tenants.id').onDelete('cascade')
    )
    .addColumn('platform_channel_id', 'varchar(255)', (col) => col.notNull())
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('type', 'varchar(50)', (col) => col.notNull())
    .addColumn('parent_channel_id', 'varchar(36)', (col) =>
      col.references('channels.id').onDelete('cascade')
    )
    .addColumn('metadata', 'json')
    .addColumn('created_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('updated_at', 'timestamp', (col) =>
      col
        .notNull()
        .defaultTo(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
    )
    .execute();

  // Add CHECK constraint for channel type
  await sql`
    ALTER TABLE channels 
    ADD CONSTRAINT check_channel_type 
    CHECK (type IN ('text', 'thread', 'forum'))
  `.execute(db);

  // Create messages table
  await db.schema
    .createTable('messages')
    .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
    .addColumn('channel_id', 'varchar(36)', (col) =>
      col.notNull().references('channels.id').onDelete('cascade')
    )
    .addColumn('platform_message_id', 'varchar(255)', (col) => col.notNull())
    .addColumn('anonymized_author_id', 'varchar(64)', (col) => col.notNull())
    .addColumn('content', 'text', (col) => col.notNull())
    .addColumn('reply_to_id', 'varchar(36)', (col) =>
      col.references('messages.id').onDelete('set null')
    )
    .addColumn('metadata', 'json')
    .addColumn('platform_created_at', 'timestamp', (col) => col.notNull())
    .addColumn('created_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('updated_at', 'timestamp', (col) =>
      col
        .notNull()
        .defaultTo(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
    )
    .execute();

  // Create message_emoji_reactions table
  await db.schema
    .createTable('message_emoji_reactions')
    .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
    .addColumn('message_id', 'varchar(36)', (col) =>
      col.notNull().references('messages.id').onDelete('cascade')
    )
    .addColumn('emoji', 'varchar(255)', (col) => col.notNull())
    .addColumn('anonymized_user_id', 'varchar(64)', (col) => col.notNull())
    .addColumn('created_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .execute();

  // Create message_attachments table
  await db.schema
    .createTable('message_attachments')
    .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
    .addColumn('message_id', 'varchar(36)', (col) =>
      col.notNull().references('messages.id').onDelete('cascade')
    )
    .addColumn('filename', 'varchar(500)', (col) => col.notNull())
    .addColumn('file_size', 'bigint', (col) => col.notNull())
    .addColumn('content_type', 'varchar(255)', (col) => col.notNull())
    .addColumn('url', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .execute();

  // Create sync_progress table
  await db.schema
    .createTable('sync_progress')
    .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
    .addColumn('tenant_id', 'varchar(36)', (col) =>
      col.notNull().references('tenants.id').onDelete('cascade')
    )
    .addColumn('channel_id', 'varchar(36)', (col) =>
      col.notNull().references('channels.id').onDelete('cascade')
    )
    .addColumn('last_synced_message_id', 'varchar(255)', (col) => col.notNull())
    .addColumn('last_synced_at', 'timestamp', (col) => col.notNull())
    .addColumn('status', 'varchar(50)', (col) => col.notNull())
    .addColumn('error_details', 'json')
    .addColumn('created_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('updated_at', 'timestamp', (col) =>
      col
        .notNull()
        .defaultTo(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
    )
    .execute();

  // Add CHECK constraint for sync status
  await sql`
    ALTER TABLE sync_progress 
    ADD CONSTRAINT check_sync_status 
    CHECK (status IN ('in_progress', 'completed', 'failed'))
  `.execute(db);

  // Add unique constraint for sync_progress
  await sql`
    ALTER TABLE sync_progress 
    ADD CONSTRAINT unique_tenant_channel 
    UNIQUE (tenant_id, channel_id)
  `.execute(db);

  // Create indexes for channels
  await db.schema
    .createIndex('idx_channels_tenant_id')
    .on('channels')
    .column('tenant_id')
    .execute();

  await db.schema
    .createIndex('idx_channels_platform_channel_id')
    .on('channels')
    .column('platform_channel_id')
    .execute();

  await db.schema
    .createIndex('idx_channels_type')
    .on('channels')
    .column('type')
    .execute();

  // Create indexes for messages
  await db.schema
    .createIndex('idx_messages_channel_id')
    .on('messages')
    .column('channel_id')
    .execute();

  await db.schema
    .createIndex('idx_messages_platform_message_id')
    .on('messages')
    .column('platform_message_id')
    .execute();

  await db.schema
    .createIndex('idx_messages_anonymized_author_id')
    .on('messages')
    .column('anonymized_author_id')
    .execute();

  await db.schema
    .createIndex('idx_messages_platform_created_at')
    .on('messages')
    .column('platform_created_at')
    .execute();

  // Create indexes for message_emoji_reactions
  await db.schema
    .createIndex('idx_message_emoji_reactions_message_id')
    .on('message_emoji_reactions')
    .column('message_id')
    .execute();

  await db.schema
    .createIndex('idx_message_emoji_reactions_emoji')
    .on('message_emoji_reactions')
    .column('emoji')
    .execute();

  // Create indexes for message_attachments
  await db.schema
    .createIndex('idx_message_attachments_message_id')
    .on('message_attachments')
    .column('message_id')
    .execute();

  // Create indexes for sync_progress
  await db.schema
    .createIndex('idx_sync_progress_tenant_id')
    .on('sync_progress')
    .column('tenant_id')
    .execute();

  await db.schema
    .createIndex('idx_sync_progress_status')
    .on('sync_progress')
    .column('status')
    .execute();

  // Note: MySQL handles updated_at automatically with ON UPDATE CURRENT_TIMESTAMP
  // No need for separate triggers
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop indexes
  await db.schema.dropIndex('idx_sync_progress_status').execute();
  await db.schema.dropIndex('idx_sync_progress_tenant_id').execute();
  await db.schema.dropIndex('idx_message_attachments_message_id').execute();
  await db.schema.dropIndex('idx_message_emoji_reactions_emoji').execute();
  await db.schema.dropIndex('idx_message_emoji_reactions_message_id').execute();
  await db.schema.dropIndex('idx_messages_platform_created_at').execute();
  await db.schema.dropIndex('idx_messages_anonymized_author_id').execute();
  await db.schema.dropIndex('idx_messages_platform_message_id').execute();
  await db.schema.dropIndex('idx_messages_channel_id').execute();
  await db.schema.dropIndex('idx_channels_type').execute();
  await db.schema.dropIndex('idx_channels_platform_channel_id').execute();
  await db.schema.dropIndex('idx_channels_tenant_id').execute();

  // Drop tables in reverse order of dependencies
  await db.schema.dropTable('sync_progress').execute();
  await db.schema.dropTable('message_attachments').execute();
  await db.schema.dropTable('message_emoji_reactions').execute();
  await db.schema.dropTable('messages').execute();
  await db.schema.dropTable('channels').execute();
}
