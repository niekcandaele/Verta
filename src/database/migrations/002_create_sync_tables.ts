import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Create channels table
  await db.schema
    .createTable('channels')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('tenant_id', 'uuid', (col) =>
      col.notNull().references('tenants.id').onDelete('cascade')
    )
    .addColumn('platform_channel_id', 'varchar(255)', (col) => col.notNull())
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('type', 'varchar(50)', (col) => col.notNull())
    .addColumn('parent_channel_id', 'uuid', (col) =>
      col.references('channels.id').onDelete('cascade')
    )
    .addColumn('metadata', 'jsonb', (col) => col.defaultTo(sql`'{}'::jsonb`))
    .addColumn('created_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addColumn('updated_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`now()`)
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
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('channel_id', 'uuid', (col) =>
      col.notNull().references('channels.id').onDelete('cascade')
    )
    .addColumn('platform_message_id', 'varchar(255)', (col) => col.notNull())
    .addColumn('anonymized_author_id', 'varchar(64)', (col) => col.notNull())
    .addColumn('content', 'text', (col) => col.notNull())
    .addColumn('reply_to_id', 'uuid', (col) =>
      col.references('messages.id').onDelete('set null')
    )
    .addColumn('metadata', 'jsonb', (col) => col.defaultTo(sql`'{}'::jsonb`))
    .addColumn('platform_created_at', 'timestamp', (col) => col.notNull())
    .addColumn('created_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addColumn('updated_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  // Create message_emoji_reactions table
  await db.schema
    .createTable('message_emoji_reactions')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('message_id', 'uuid', (col) =>
      col.notNull().references('messages.id').onDelete('cascade')
    )
    .addColumn('emoji', 'varchar(255)', (col) => col.notNull())
    .addColumn('anonymized_user_id', 'varchar(64)', (col) => col.notNull())
    .addColumn('created_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  // Create message_attachments table
  await db.schema
    .createTable('message_attachments')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('message_id', 'uuid', (col) =>
      col.notNull().references('messages.id').onDelete('cascade')
    )
    .addColumn('filename', 'varchar(500)', (col) => col.notNull())
    .addColumn('file_size', 'bigint', (col) => col.notNull())
    .addColumn('content_type', 'varchar(255)', (col) => col.notNull())
    .addColumn('url', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  // Create sync_progress table
  await db.schema
    .createTable('sync_progress')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('tenant_id', 'uuid', (col) =>
      col.notNull().references('tenants.id').onDelete('cascade')
    )
    .addColumn('channel_id', 'uuid', (col) =>
      col.notNull().references('channels.id').onDelete('cascade')
    )
    .addColumn('last_synced_message_id', 'varchar(255)', (col) => col.notNull())
    .addColumn('last_synced_at', 'timestamp', (col) => col.notNull())
    .addColumn('status', 'varchar(50)', (col) => col.notNull())
    .addColumn('error_details', 'jsonb')
    .addColumn('created_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addColumn('updated_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`now()`)
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

  // Create triggers for updated_at columns
  await sql`
    CREATE TRIGGER update_channels_updated_at 
    BEFORE UPDATE ON channels 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
  `.execute(db);

  await sql`
    CREATE TRIGGER update_messages_updated_at 
    BEFORE UPDATE ON messages 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
  `.execute(db);

  await sql`
    CREATE TRIGGER update_sync_progress_updated_at 
    BEFORE UPDATE ON sync_progress 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop triggers
  await sql`DROP TRIGGER IF EXISTS update_sync_progress_updated_at ON sync_progress`.execute(
    db
  );
  await sql`DROP TRIGGER IF EXISTS update_messages_updated_at ON messages`.execute(
    db
  );
  await sql`DROP TRIGGER IF EXISTS update_channels_updated_at ON channels`.execute(
    db
  );

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
