import type {
  ColumnType,
  Generated,
  Selectable,
  Insertable,
  Updateable,
} from 'kysely';

/**
 * Database table types for multi-tenant system
 */

// Tenant status enum matching PostgreSQL enum type
export type TenantStatus = 'ACTIVE' | 'CANCELLED' | 'MAINTENANCE';

// Platform enum matching PostgreSQL enum type
export type Platform = 'slack' | 'discord';

// Channel type enum
export type ChannelType = 'text' | 'thread' | 'forum' | 'category';

// Sync status enum
export type SyncStatus = 'in_progress' | 'completed' | 'failed';

/**
 * Database table schema for tenants
 */
export interface TenantsTable {
  // UUID primary key with default generation
  id: Generated<string>;

  // Tenant display name
  name: string;

  // URL-friendly unique identifier
  slug: string;

  // Tenant status
  status: TenantStatus;

  // Integration platform
  platform: Platform;

  // Platform-specific identifier (e.g., Slack workspace ID, Discord guild ID)
  platform_id: string;

  // Timestamps with automatic management
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

/**
 * Database table schema for channels
 */
export interface ChannelsTable {
  id: Generated<string>;
  tenant_id: string;
  platform_channel_id: string;
  name: string;
  type: ChannelType;
  parent_channel_id: string | null;
  metadata: ColumnType<unknown, string | undefined, string>;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

/**
 * Database table schema for messages
 */
export interface MessagesTable {
  id: Generated<string>;
  channel_id: string;
  platform_message_id: string;
  anonymized_author_id: string;
  content: string;
  reply_to_id: string | null;
  metadata: ColumnType<unknown, string | undefined, string>;
  platform_created_at: ColumnType<Date, Date | string, never>;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

/**
 * Database table schema for message emoji reactions
 */
export interface MessageEmojiReactionsTable {
  id: Generated<string>;
  message_id: string;
  emoji: string;
  anonymized_user_id: string;
  created_at: ColumnType<Date, string | undefined, never>;
}

/**
 * Database table schema for message attachments
 */
export interface MessageAttachmentsTable {
  id: Generated<string>;
  message_id: string;
  filename: string;
  file_size: ColumnType<
    bigint,
    bigint | number | string,
    bigint | number | string
  >;
  content_type: string;
  url: string;
  created_at: ColumnType<Date, string | undefined, never>;
}

/**
 * Database table schema for sync progress
 */
export interface SyncProgressTable {
  id: Generated<string>;
  tenant_id: string;
  channel_id: string;
  last_synced_message_id: string;
  last_synced_at: ColumnType<Date, Date | string, Date | string>;
  status: SyncStatus;
  error_details: ColumnType<unknown, unknown | undefined, unknown>;
  worker_id: string | null;
  started_at: ColumnType<Date, Date | string | undefined, Date | string>;
  messages_per_second: ColumnType<number, number | undefined, number>;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

/**
 * Database table schema for channel sync jobs
 */
export interface ChannelSyncJobsTable {
  id: Generated<string>;
  tenant_id: string;
  channel_id: string;
  parent_job_id: string;
  worker_id: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  started_at: ColumnType<Date, Date | string | undefined, Date | string>;
  completed_at: ColumnType<Date, Date | string | undefined, Date | string>;
  messages_processed: ColumnType<number, number | undefined, number>;
  error_details: ColumnType<unknown, unknown | undefined, unknown>;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

/**
 * Database table schema for tenant branding
 */
export interface TenantBrandingTable {
  id: Generated<string>;
  tenant_id: string;
  logo: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

/**
 * Database schema interface
 */
export interface Database {
  tenants: TenantsTable;
  channels: ChannelsTable;
  messages: MessagesTable;
  message_emoji_reactions: MessageEmojiReactionsTable;
  message_attachments: MessageAttachmentsTable;
  sync_progress: SyncProgressTable;
  channel_sync_jobs: ChannelSyncJobsTable;
  tenant_branding: TenantBrandingTable;
}

/**
 * Type helpers for working with tenant records
 */
export type Tenant = Selectable<TenantsTable>;
export type NewTenant = Insertable<TenantsTable>;
export type TenantUpdate = Updateable<TenantsTable>;

/**
 * Type helpers for working with channel records
 */
export type Channel = Selectable<ChannelsTable>;
export type NewChannel = Insertable<ChannelsTable>;
export type ChannelUpdate = Updateable<ChannelsTable>;

/**
 * Type helpers for working with message records
 */
export type Message = Selectable<MessagesTable>;
export type NewMessage = Insertable<MessagesTable>;
export type MessageUpdate = Updateable<MessagesTable>;

/**
 * Type helpers for working with message emoji reaction records
 */
export type MessageEmojiReaction = Selectable<MessageEmojiReactionsTable>;
export type NewMessageEmojiReaction = Insertable<MessageEmojiReactionsTable>;

/**
 * Type helpers for working with message attachment records
 */
export type MessageAttachment = Selectable<MessageAttachmentsTable>;
export type NewMessageAttachment = Insertable<MessageAttachmentsTable>;

/**
 * Type helpers for working with sync progress records
 */
export type SyncProgress = Selectable<SyncProgressTable>;
export type NewSyncProgress = Insertable<SyncProgressTable>;
export type SyncProgressUpdate = Updateable<SyncProgressTable>;

/**
 * Type helpers for working with tenant branding records
 */
export type TenantBranding = Selectable<TenantBrandingTable>;
export type NewTenantBranding = Insertable<TenantBrandingTable>;
export type TenantBrandingUpdate = Updateable<TenantBrandingTable>;
