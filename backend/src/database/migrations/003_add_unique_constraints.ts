import { Kysely } from 'kysely';

/**
 * Add missing unique constraints for upsert operations
 */
export async function up(db: Kysely<any>): Promise<void> {
  // Add unique constraint for channels (tenant_id, platform_channel_id)
  // This supports the upsert operation in ChannelRepository
  await db.schema
    .createIndex('idx_channels_tenant_platform_unique')
    .on('channels')
    .columns(['tenant_id', 'platform_channel_id'])
    .unique()
    .execute();

  // Add unique constraint for messages (channel_id, platform_message_id)
  // This supports the bulkUpsert operation in MessageRepository
  await db.schema
    .createIndex('idx_messages_channel_platform_unique')
    .on('messages')
    .columns(['channel_id', 'platform_message_id'])
    .unique()
    .execute();

  // Add unique constraint for message_emoji_reactions
  // This prevents duplicate reactions from the same user on the same message
  await db.schema
    .createIndex('idx_message_emoji_reactions_unique')
    .on('message_emoji_reactions')
    .columns(['message_id', 'anonymized_user_id', 'emoji'])
    .unique()
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop the unique indexes in reverse order
  await db.schema.dropIndex('idx_message_emoji_reactions_unique').execute();

  await db.schema.dropIndex('idx_messages_channel_platform_unique').execute();

  await db.schema.dropIndex('idx_channels_tenant_platform_unique').execute();
}
