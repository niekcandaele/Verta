import type { BaseCrudRepository, PaginatedResult } from '../types.js';
import type {
  Channel,
  Message,
  MessageEmojiReaction,
  MessageAttachment,
  SyncProgress,
  CreateChannelData,
  UpdateChannelData,
  CreateMessageData,
  CreateMessageEmojiReactionData,
  CreateMessageAttachmentData,
  CreateSyncProgressData,
  UpdateSyncProgressData,
} from 'shared-types';

/**
 * Channel repository interface
 */
export interface ChannelRepository
  extends BaseCrudRepository<Channel, CreateChannelData, UpdateChannelData> {
  /**
   * Find a channel by platform channel ID and tenant ID
   */
  findByPlatformId(
    tenantId: string,
    platformChannelId: string
  ): Promise<Channel | null>;

  /**
   * Find all channels for a tenant
   */
  findByTenantId(tenantId: string): Promise<Channel[]>;

  /**
   * Find all channels for a tenant
   */
  findByTenant(tenantId: string): Promise<Channel[]>;

  /**
   * Find child channels of a parent channel
   */
  findByParentId(parentChannelId: string): Promise<Channel[]>;

  /**
   * Upsert a channel (create if not exists, update if exists)
   */
  upsert(data: CreateChannelData): Promise<Channel>;
}

/**
 * Message repository interface with bulk operations
 */
export interface MessageRepository
  extends BaseCrudRepository<Message, CreateMessageData, never> {
  /**
   * Find a message by platform message ID and channel ID
   */
  findByPlatformId(
    channelId: string,
    platformMessageId: string
  ): Promise<Message | null>;

  /**
   * Find all messages in a channel with pagination
   */
  findByChannel(
    channelId: string,
    options?: {
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<PaginatedResult<Message>>;

  /**
   * Find all replies to a specific message
   */
  findReplies(messageId: string): Promise<Message[]>;

  /**
   * Bulk insert messages
   */
  bulkCreate(messages: CreateMessageData[]): Promise<Message[]>;

  /**
   * Bulk upsert messages (create if not exists, skip if exists)
   */
  bulkUpsert(messages: CreateMessageData[]): Promise<{
    created: Message[];
    skipped: number;
  }>;

  /**
   * Count messages in a channel
   */
  countByChannel(channelId: string): Promise<number>;

  /**
   * Get the latest message in a channel
   */
  getLatestByChannel(channelId: string): Promise<Message | null>;
}

/**
 * Message emoji reaction repository interface
 */
export interface MessageEmojiReactionRepository
  extends BaseCrudRepository<
    MessageEmojiReaction,
    CreateMessageEmojiReactionData,
    never
  > {
  /**
   * Find all reactions for a message
   */
  findByMessage(messageId: string): Promise<MessageEmojiReaction[]>;

  /**
   * Find all reactions by a specific user
   */
  findByUser(anonymizedUserId: string): Promise<MessageEmojiReaction[]>;

  /**
   * Find a specific reaction by user and emoji
   */
  findByUserAndEmoji(
    messageId: string,
    anonymizedUserId: string,
    emoji: string
  ): Promise<MessageEmojiReaction | null>;

  /**
   * Bulk create reactions
   */
  bulkCreate(
    reactions: CreateMessageEmojiReactionData[]
  ): Promise<MessageEmojiReaction[]>;

  /**
   * Delete all reactions for a message
   */
  deleteByMessage(messageId: string): Promise<number>;

  /**
   * Delete a specific user's reaction
   */
  deleteByUserAndEmoji(
    messageId: string,
    anonymizedUserId: string,
    emoji: string
  ): Promise<boolean>;
}

/**
 * Message attachment repository interface
 */
export interface MessageAttachmentRepository
  extends BaseCrudRepository<
    MessageAttachment,
    CreateMessageAttachmentData,
    never
  > {
  /**
   * Find all attachments for a message
   */
  findByMessage(messageId: string): Promise<MessageAttachment[]>;

  /**
   * Bulk create attachments
   */
  bulkCreate(
    attachments: CreateMessageAttachmentData[]
  ): Promise<MessageAttachment[]>;

  /**
   * Delete all attachments for a message
   */
  deleteByMessage(messageId: string): Promise<number>;

  /**
   * Get total attachment size for a channel
   */
  getTotalSizeByChannel(channelId: string): Promise<bigint>;
}

/**
 * Sync progress repository interface
 */
export interface SyncProgressRepository
  extends BaseCrudRepository<
    SyncProgress,
    CreateSyncProgressData,
    UpdateSyncProgressData
  > {
  /**
   * Find sync progress for a specific channel
   */
  findByChannel(channelId: string): Promise<SyncProgress | null>;

  /**
   * Find all sync progress for a tenant
   */
  findByTenant(tenantId: string): Promise<SyncProgress[]>;

  /**
   * Find sync progress by tenant and channel
   */
  findByTenantAndChannel(
    tenantId: string,
    channelId: string
  ): Promise<SyncProgress | null>;

  /**
   * Update or create sync progress (upsert)
   */
  upsert(data: CreateSyncProgressData): Promise<SyncProgress>;

  /**
   * Mark sync as failed with error details
   */
  markFailed(
    channelId: string,
    errorDetails: unknown
  ): Promise<SyncProgress | null>;

  /**
   * Mark sync as completed
   */
  markCompleted(
    channelId: string,
    lastSyncedMessageId: string,
    lastSyncedAt: Date
  ): Promise<SyncProgress | null>;

  /**
   * Get channels that need syncing for a tenant
   */
  getChannelsNeedingSync(
    tenantId: string,
    olderThan?: Date
  ): Promise<Array<{ channelId: string; lastSyncedAt: Date | null }>>;

  /**
   * Delete sync progress for a channel
   */
  deleteByChannel(channelId: string): Promise<boolean>;
}
