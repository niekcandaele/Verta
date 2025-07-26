import type { ChannelType, SyncStatus } from '../database/types.js';

/**
 * Platform-agnostic sync data types
 */

/**
 * Platform-agnostic channel representation
 */
export interface Channel {
  id: string;
  tenantId: string;
  platformChannelId: string;
  name: string;
  type: ChannelType;
  parentChannelId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Platform-agnostic message representation
 */
export interface Message {
  id: string;
  channelId: string;
  platformMessageId: string;
  anonymizedAuthorId: string;
  content: string;
  replyToId: string | null;
  metadata: Record<string, unknown>;
  platformCreatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Message emoji reaction representation
 */
export interface MessageEmojiReaction {
  id: string;
  messageId: string;
  emoji: string;
  anonymizedUserId: string;
  createdAt: Date;
}

/**
 * Message attachment representation
 */
export interface MessageAttachment {
  id: string;
  messageId: string;
  filename: string;
  fileSize: bigint;
  contentType: string;
  url: string;
  createdAt: Date;
}

/**
 * Sync progress tracking representation
 */
export interface SyncProgress {
  id: string;
  tenantId: string;
  channelId: string;
  lastSyncedMessageId: string;
  lastSyncedAt: Date;
  status: SyncStatus;
  errorDetails: unknown | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Platform channel data from external platforms (Discord, Slack, etc.)
 */
export interface PlatformChannel {
  id: string;
  name: string;
  type: 'text' | 'thread' | 'forum' | 'voice' | 'category';
  parentId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Platform message data from external platforms
 */
export interface PlatformMessage {
  id: string;
  channelId: string;
  authorId: string;
  content: string;
  replyToId?: string;
  createdAt: Date;
  metadata?: Record<string, unknown>;
  reactions?: Array<{
    emoji: string;
    users: string[];
  }>;
  attachments?: Array<{
    filename: string;
    fileSize: number;
    contentType: string;
    url: string;
  }>;
}

/**
 * BullMQ job data for sync operations
 */
export interface SyncJobData {
  tenantId: string;
  syncType: 'full' | 'incremental';
  channelIds?: string[]; // Optional: sync specific channels only
  startDate?: Date; // Optional: sync messages from this date
  endDate?: Date; // Optional: sync messages until this date
}

/**
 * Sync checkpoint data for resumable operations
 */
export interface SyncCheckpoint {
  channelId: string;
  lastMessageId: string;
  lastMessageTimestamp: Date;
  messagesProcessed: number;
  hasMoreMessages: boolean;
}

/**
 * Sync job result data
 */
export interface SyncJobResult {
  tenantId: string;
  channelsProcessed: number;
  messagesProcessed: number;
  reactionsProcessed: number;
  attachmentsProcessed: number;
  errors: Array<{
    channelId?: string;
    error: string;
    timestamp: Date;
  }>;
  startedAt: Date;
  completedAt: Date;
}

/**
 * Create/Update DTOs
 */

export interface CreateChannelData {
  tenantId: string;
  platformChannelId: string;
  name: string;
  type: ChannelType;
  parentChannelId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface UpdateChannelData {
  name?: string;
  type?: ChannelType;
  parentChannelId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CreateMessageData {
  channelId: string;
  platformMessageId: string;
  anonymizedAuthorId: string;
  content: string;
  replyToId?: string | null;
  metadata?: Record<string, unknown>;
  platformCreatedAt: Date;
}

export interface CreateMessageEmojiReactionData {
  messageId: string;
  emoji: string;
  anonymizedUserId: string;
}

export interface CreateMessageAttachmentData {
  messageId: string;
  filename: string;
  fileSize: bigint | number;
  contentType: string;
  url: string;
}

export interface CreateSyncProgressData {
  tenantId: string;
  channelId: string;
  lastSyncedMessageId: string;
  lastSyncedAt: Date;
  status: SyncStatus;
  errorDetails?: unknown;
}

export interface UpdateSyncProgressData {
  lastSyncedMessageId?: string;
  lastSyncedAt?: Date;
  status?: SyncStatus;
  errorDetails?: unknown;
}
