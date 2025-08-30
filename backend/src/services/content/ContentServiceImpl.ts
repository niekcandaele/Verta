/**
 * Content service implementation
 */

import type { ContentService } from './ContentService.js';
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
import type { TenantRepository } from '../../repositories/tenant/TenantRepository.js';
import type { TenantBrandingRepository } from '../../repositories/tenant/TenantBrandingRepository.js';
import type { ChannelRepositoryImpl } from '../../repositories/sync/ChannelRepository.js';
import type { MessageRepositoryImpl } from '../../repositories/sync/MessageRepository.js';
import {
  ServiceErrorType,
  createSuccessResult,
  createErrorResult,
  createServiceError,
} from '../types.js';
import logger from '../../utils/logger.js';

/**
 * Concrete implementation of ContentService
 * Handles content delivery for the public API
 */
export class ContentServiceImpl implements ContentService {
  constructor(
    private readonly tenantRepository: TenantRepository,
    private readonly brandingRepository: TenantBrandingRepository,
    private readonly channelRepository: ChannelRepositoryImpl,
    private readonly messageRepository: MessageRepositoryImpl
  ) {}

  /**
   * Get tenant information by slug
   */
  async getTenant(slug: string): Promise<ServiceResult<Tenant>> {
    try {
      const tenant = await this.tenantRepository.findBySlug(slug);
      if (!tenant) {
        return createErrorResult(
          createServiceError(
            ServiceErrorType.NOT_FOUND,
            `Tenant with slug '${slug}' not found`
          )
        );
      }
      return createSuccessResult(tenant);
    } catch (error) {
      logger.error('Failed to get tenant', { slug, error });
      return createErrorResult(
        createServiceError(
          ServiceErrorType.DATABASE_ERROR,
          'Failed to retrieve tenant information'
        )
      );
    }
  }

  /**
   * Get tenant branding by slug
   */
  async getBranding(
    slug: string
  ): Promise<ServiceResult<TenantBranding | null>> {
    try {
      // First get the tenant to get its ID
      const tenant = await this.tenantRepository.findBySlug(slug);
      if (!tenant) {
        return createErrorResult(
          createServiceError(
            ServiceErrorType.NOT_FOUND,
            `Tenant with slug '${slug}' not found`
          )
        );
      }

      const branding = await this.brandingRepository.findByTenantId(tenant.id);
      return createSuccessResult(branding);
    } catch (error) {
      logger.error('Failed to get branding', { slug, error });
      return createErrorResult(
        createServiceError(
          ServiceErrorType.DATABASE_ERROR,
          'Failed to retrieve branding information'
        )
      );
    }
  }

  /**
   * Get all channels for a tenant
   */
  async getChannels(tenantSlug: string): Promise<ServiceResult<Channel[]>> {
    try {
      // First get the tenant to get its ID
      const tenant = await this.tenantRepository.findBySlug(tenantSlug);
      if (!tenant) {
        return createErrorResult(
          createServiceError(
            ServiceErrorType.NOT_FOUND,
            `Tenant with slug '${tenantSlug}' not found`
          )
        );
      }

      const channels = await this.channelRepository.findByTenantId(tenant.id);
      return createSuccessResult(channels);
    } catch (error) {
      logger.error('Failed to get channels', { tenantSlug, error });
      return createErrorResult(
        createServiceError(
          ServiceErrorType.DATABASE_ERROR,
          'Failed to retrieve channels'
        )
      );
    }
  }

  /**
   * Get a specific channel
   */
  async getChannel(
    tenantSlug: string,
    channelId: string
  ): Promise<ServiceResult<Channel>> {
    try {
      // First get the tenant to verify access
      const tenant = await this.tenantRepository.findBySlug(tenantSlug);
      if (!tenant) {
        return createErrorResult(
          createServiceError(
            ServiceErrorType.NOT_FOUND,
            `Tenant with slug '${tenantSlug}' not found`
          )
        );
      }

      const channel = await this.channelRepository.findById(channelId);
      if (!channel) {
        return createErrorResult(
          createServiceError(
            ServiceErrorType.NOT_FOUND,
            `Channel with ID '${channelId}' not found`
          )
        );
      }

      // Verify the channel belongs to the tenant
      if (channel.tenantId !== tenant.id) {
        return createErrorResult(
          createServiceError(
            ServiceErrorType.NOT_FOUND,
            `Channel not found for this tenant`
          )
        );
      }

      return createSuccessResult(channel);
    } catch (error) {
      logger.error('Failed to get channel', { tenantSlug, channelId, error });
      return createErrorResult(
        createServiceError(
          ServiceErrorType.DATABASE_ERROR,
          'Failed to retrieve channel'
        )
      );
    }
  }

  /**
   * Get messages for a channel with pagination
   */
  async getChannelMessages(
    tenantSlug: string,
    channelId: string,
    pagination: PaginationOptions = { page: 1, limit: 50 }
  ): Promise<ServiceResult<PaginatedResult<Message>>> {
    try {
      // First get the tenant to verify access
      const tenant = await this.tenantRepository.findBySlug(tenantSlug);
      if (!tenant) {
        return createErrorResult(
          createServiceError(
            ServiceErrorType.NOT_FOUND,
            `Tenant with slug '${tenantSlug}' not found`
          )
        );
      }

      // Verify the channel exists and belongs to the tenant
      const channel = await this.channelRepository.findById(channelId);
      if (!channel || channel.tenantId !== tenant.id) {
        return createErrorResult(
          createServiceError(
            ServiceErrorType.NOT_FOUND,
            `Channel not found for this tenant`
          )
        );
      }

      // Convert pagination options to repository format
      const offset = ((pagination.page || 1) - 1) * (pagination.limit || 50);
      const messages = await this.messageRepository.findByChannelWithExtras(
        channelId,
        {
          limit: pagination.limit,
          offset,
        }
      );
      return createSuccessResult(messages);
    } catch (error) {
      logger.error('Failed to get channel messages', {
        tenantSlug,
        channelId,
        error,
      });
      return createErrorResult(
        createServiceError(
          ServiceErrorType.DATABASE_ERROR,
          'Failed to retrieve messages'
        )
      );
    }
  }

  /**
   * Get threads for a forum channel
   */
  async getChannelThreads(
    tenantSlug: string,
    channelId: string,
    pagination: PaginationOptions = { page: 1, limit: 20 }
  ): Promise<ServiceResult<PaginatedResult<Channel>>> {
    try {
      // First get the tenant to verify access
      const tenant = await this.tenantRepository.findBySlug(tenantSlug);
      if (!tenant) {
        return createErrorResult(
          createServiceError(
            ServiceErrorType.NOT_FOUND,
            `Tenant with slug '${tenantSlug}' not found`
          )
        );
      }

      // Verify the channel exists and belongs to the tenant
      const channel = await this.channelRepository.findById(channelId);
      if (!channel || channel.tenantId !== tenant.id) {
        return createErrorResult(
          createServiceError(
            ServiceErrorType.NOT_FOUND,
            `Channel not found for this tenant`
          )
        );
      }

      // Get thread channels that belong to this forum
      const allThreads = await this.channelRepository.findByParentId(channelId);

      // Filter to only thread type channels
      const threadChannels = allThreads.filter((c) => c.type === 'thread');

      // Apply pagination
      const offset = ((pagination.page || 1) - 1) * (pagination.limit || 20);
      const paginatedThreads = threadChannels.slice(
        offset,
        offset + (pagination.limit || 20)
      );

      // Enrich threads with message data
      const enrichedThreads = await Promise.all(
        paginatedThreads.map(async (thread) => {
          // Get message stats for this thread
          const messages = await this.messageRepository.findByChannel(
            thread.id,
            { limit: 1000 }
          );

          // Parse metadata if it exists
          let metadata: any = {};
          if (thread.metadata) {
            try {
              metadata =
                typeof thread.metadata === 'string'
                  ? JSON.parse(thread.metadata)
                  : thread.metadata;
            } catch (e) {
              logger.warn('Failed to parse thread metadata', {
                threadId: thread.id,
                error: e,
              });
            }
          }

          // Find first and last message
          const firstMessage = messages.data[0];
          const lastMessage = messages.data[messages.data.length - 1];

          // Create enriched thread object
          const enrichedThread: any = {
            ...thread,
            messageCount: messages.pagination.total,
            lastActivity:
              lastMessage?.platformCreatedAt ||
              metadata.createdTimestamp ||
              thread.createdAt,
            archived: metadata.archived || false,
            locked: metadata.locked || false,
          };

          // Add first message if it exists
          if (firstMessage && firstMessage.content) {
            enrichedThread.firstMessage = {
              content: firstMessage.content,
            };
          }

          return enrichedThread;
        })
      );

      const result: PaginatedResult<any> = {
        data: enrichedThreads,
        pagination: {
          page: pagination.page || 1,
          limit: pagination.limit || 20,
          total: threadChannels.length,
          totalPages: Math.ceil(
            threadChannels.length / (pagination.limit || 20)
          ),
        },
      };

      return createSuccessResult(result);
    } catch (error) {
      logger.error('Failed to get channel threads', {
        tenantSlug,
        channelId,
        error,
      });
      return createErrorResult(
        createServiceError(
          ServiceErrorType.DATABASE_ERROR,
          'Failed to retrieve threads'
        )
      );
    }
  }

  /**
   * Get messages for a specific thread
   */
  async getThreadMessages(
    tenantSlug: string,
    channelId: string,
    threadId: string,
    pagination: PaginationOptions = { page: 1, limit: 50 }
  ): Promise<ServiceResult<PaginatedResult<Message>>> {
    try {
      // First get the tenant to verify access
      const tenant = await this.tenantRepository.findBySlug(tenantSlug);
      if (!tenant) {
        return createErrorResult(
          createServiceError(
            ServiceErrorType.NOT_FOUND,
            `Tenant with slug '${tenantSlug}' not found`
          )
        );
      }

      // Verify the channel exists and belongs to the tenant
      const channel = await this.channelRepository.findById(channelId);
      if (!channel || channel.tenantId !== tenant.id) {
        return createErrorResult(
          createServiceError(
            ServiceErrorType.NOT_FOUND,
            `Channel not found for this tenant`
          )
        );
      }

      // For now, return messages from the channel filtered by thread
      // TODO: Implement proper thread message filtering when repository supports it
      const offset = ((pagination.page || 1) - 1) * (pagination.limit || 50);
      const messages = await this.messageRepository.findByChannelWithExtras(
        channelId,
        {
          limit: pagination.limit,
          offset,
        }
      );
      return createSuccessResult(messages);
    } catch (error) {
      logger.error('Failed to get thread messages', {
        tenantSlug,
        channelId,
        threadId,
        error,
      });
      return createErrorResult(
        createServiceError(
          ServiceErrorType.DATABASE_ERROR,
          'Failed to retrieve thread messages'
        )
      );
    }
  }
}
