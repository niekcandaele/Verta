/**
 * Platform-agnostic sync data types
 */

/**
 * Re-export shared types for convenience
 */
export type {
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
  // New fields for parallel processing
  parallelStats?: {
    maxConcurrentChannels: number;
    averageChannelTime: number;
    totalApiCalls: number;
    rateLimitEncounters: number;
  };
  channelResults?: ChannelSyncState[];
}

/**
 * Channel sync state for parallel processing
 */
export interface ChannelSyncState {
  channelId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  workerId?: string;
  startedAt?: Date;
  completedAt?: Date;
  messagesProcessed: number;
  lastMessageId?: string;
  error?: string;
  retryCount: number;
}

// Create/Update DTOs are now imported from shared-types above
