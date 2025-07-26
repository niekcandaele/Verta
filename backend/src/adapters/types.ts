/**
 * Platform adapter interfaces for external platform integrations
 */

import type {
  PlatformChannel,
  PlatformMessage,
  SyncCheckpoint,
} from '../types/sync.js';

/**
 * Options for fetching messages from a platform
 */
export interface FetchMessagesOptions {
  /**
   * Fetch messages after this message ID
   */
  afterMessageId?: string;

  /**
   * Fetch messages after this timestamp
   */
  afterTimestamp?: Date;

  /**
   * Fetch messages before this timestamp
   */
  beforeTimestamp?: Date;

  /**
   * Maximum number of messages to fetch (platform may have its own limits)
   */
  limit?: number;
}

/**
 * Result of fetching messages from a platform
 */
export interface FetchMessagesResult {
  /**
   * The messages fetched
   */
  messages: PlatformMessage[];

  /**
   * Whether there are more messages to fetch
   */
  hasMore: boolean;

  /**
   * Checkpoint data for resuming the fetch operation
   */
  checkpoint?: SyncCheckpoint;
}

/**
 * Platform adapter interface for fetching data from external platforms
 */
export interface PlatformAdapter {
  /**
   * Initialize the adapter (e.g., login, connect to API)
   */
  initialize(): Promise<void>;

  /**
   * Cleanup resources (e.g., close connections)
   */
  cleanup(): Promise<void>;

  /**
   * Verify the platform connection is valid for the given platform ID
   */
  verifyConnection(platformId: string): Promise<boolean>;

  /**
   * Fetch all channels for a given platform ID (e.g., Discord guild ID, Slack workspace ID)
   */
  fetchChannels(platformId: string): Promise<PlatformChannel[]>;

  /**
   * Fetch messages from a specific channel
   */
  fetchMessages(
    channelId: string,
    options?: FetchMessagesOptions
  ): Promise<FetchMessagesResult>;

  /**
   * Get platform-specific metadata about a channel
   */
  getChannelMetadata(channelId: string): Promise<Record<string, unknown>>;

  /**
   * Get platform-specific metadata about the workspace/guild
   */
  getPlatformMetadata(platformId: string): Promise<Record<string, unknown>>;
}

/**
 * Factory function type for creating platform adapters
 */
export type PlatformAdapterFactory = () => PlatformAdapter;

/**
 * Configuration options for platform adapters
 */
export interface PlatformAdapterConfig {
  /**
   * Maximum number of retries for API requests
   */
  maxRetries?: number;

  /**
   * Timeout for API requests in milliseconds
   */
  requestTimeout?: number;
}
