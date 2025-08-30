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
}
