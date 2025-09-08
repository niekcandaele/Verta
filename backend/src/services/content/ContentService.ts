/**
 * Content service interface for public API
 */

import type { ServiceResult } from '../types.js';
import type {
  Tenant,
  TenantBranding,
} from '../../repositories/tenant/types.js';
import type { Channel, Message } from 'shared-types';
import type {
  PaginatedResult,
  PaginationOptions,
} from '../../repositories/types.js';

/**
 * Options for fetching message context
 */
export interface MessageContextOptions {
  beforeCount?: number; // Default: 50
  afterCount?: number;  // Default: 50
}

/**
 * Message context response with target message and surrounding messages
 */
export interface MessageContextResult {
  messages: Message[];
  target: {
    id: string;
    position: number;
  };
  navigation: {
    before: { hasMore: boolean; cursor: string | null };
    after: { hasMore: boolean; cursor: string | null };
  };
}

/**
 * Service interface for content delivery via REST API
 */
export interface ContentService {
  /**
   * Get tenant information by slug
   * @param slug - The tenant slug from header
   * @returns Service result with tenant data
   */
  getTenant(slug: string): Promise<ServiceResult<Tenant>>;

  /**
   * Get tenant branding by slug
   * @param slug - The tenant slug from header
   * @returns Service result with branding data
   */
  getBranding(slug: string): Promise<ServiceResult<TenantBranding | null>>;

  /**
   * Get all channels for a tenant
   * @param tenantSlug - The tenant slug from header
   * @returns Service result with channel list
   */
  getChannels(tenantSlug: string): Promise<ServiceResult<Channel[]>>;

  /**
   * Get a specific channel
   * @param tenantSlug - The tenant slug from header
   * @param channelId - The channel ID
   * @returns Service result with channel data
   */
  getChannel(
    tenantSlug: string,
    channelId: string
  ): Promise<ServiceResult<Channel>>;

  /**
   * Get messages for a channel with pagination
   * @param tenantSlug - The tenant slug from header
   * @param channelId - The channel ID
   * @param pagination - Pagination options
   * @returns Service result with paginated messages
   */
  getChannelMessages(
    tenantSlug: string,
    channelId: string,
    pagination?: PaginationOptions
  ): Promise<ServiceResult<PaginatedResult<Message>>>;

  /**
   * Get threads for a forum channel
   * @param tenantSlug - The tenant slug from header
   * @param channelId - The forum channel ID
   * @param pagination - Pagination options
   * @returns Service result with paginated threads
   */
  getChannelThreads(
    tenantSlug: string,
    channelId: string,
    pagination?: PaginationOptions
  ): Promise<ServiceResult<PaginatedResult<Channel>>>;

  /**
   * Get messages for a specific thread
   * @param tenantSlug - The tenant slug from header
   * @param channelId - The forum channel ID
   * @param threadId - The thread ID
   * @param pagination - Pagination options
   * @returns Service result with paginated messages
   */
  getThreadMessages(
    tenantSlug: string,
    channelId: string,
    threadId: string,
    pagination?: PaginationOptions
  ): Promise<ServiceResult<PaginatedResult<Message>>>;

  /**
   * Get a channel by slug
   * @param tenantSlug - The tenant slug from header
   * @param channelSlug - The channel slug
   * @returns Service result with channel data
   */
  getChannelBySlug(
    tenantSlug: string,
    channelSlug: string
  ): Promise<ServiceResult<Channel>>;

  /**
   * Get a message with surrounding context
   * @param tenantSlug - The tenant slug from header
   * @param messageId - The message ID (base62 decoded)
   * @param options - Context options (before/after count)
   * @returns Service result with message context
   */
  getMessageContext(
    tenantSlug: string,
    messageId: string,
    options?: MessageContextOptions
  ): Promise<ServiceResult<MessageContextResult>>;

  /**
   * Get messages around a specific timestamp
   * @param tenantSlug - The tenant slug from header
   * @param channelId - The channel ID
   * @param timestamp - The target timestamp
   * @param options - Context options (before/after count)
   * @returns Service result with message context
   */
  getMessagesAtTimestamp(
    tenantSlug: string,
    channelId: string,
    timestamp: Date,
    options?: MessageContextOptions
  ): Promise<ServiceResult<MessageContextResult>>;
}
