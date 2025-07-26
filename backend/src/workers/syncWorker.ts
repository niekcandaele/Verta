/**
 * BullMQ worker for processing platform sync jobs
 */

import { Worker, type Job } from 'bullmq';
import logger from '../utils/logger.js';
import { redisConfig } from '../config/redis.js';
import { SYNC_QUEUE_NAME } from '../queues/syncQueue.js';
import { PlatformAdapterFactory } from '../adapters/index.js';
import type { PlatformAdapter } from '../adapters/types.js';
import { db } from '../database/index.js';
import type { TenantRepository } from '../repositories/tenant/index.js';
import { TenantRepositoryImpl } from '../repositories/tenant/index.js';
import {
  ChannelRepository,
  MessageRepository,
  MessageEmojiReactionRepository,
  MessageAttachmentRepository,
  SyncProgressRepository,
} from '../repositories/sync/index.js';
import { anonymizeUserId } from '../utils/crypto.js';
import type {
  SyncJobData,
  SyncJobResult,
  PlatformMessage,
} from '../types/sync.js';
import type { Platform, ChannelType } from '../database/types.js';
import { isRateLimitError, classifyError } from '../types/errors.js';

/**
 * Sync worker implementation
 */
export class SyncWorker {
  private worker: Worker<SyncJobData, SyncJobResult>;
  private tenantRepo: TenantRepository;
  private channelRepo: ChannelRepository;
  private messageRepo: MessageRepository;
  private reactionRepo: MessageEmojiReactionRepository;
  private attachmentRepo: MessageAttachmentRepository;
  private progressRepo: SyncProgressRepository;

  constructor() {
    // Initialize repositories
    this.tenantRepo = new TenantRepositoryImpl(db);
    this.channelRepo = new ChannelRepository(db);
    this.messageRepo = new MessageRepository(db);
    this.reactionRepo = new MessageEmojiReactionRepository(db);
    this.attachmentRepo = new MessageAttachmentRepository(db);
    this.progressRepo = new SyncProgressRepository(db);

    // Create the worker
    this.worker = new Worker<SyncJobData, SyncJobResult>(
      SYNC_QUEUE_NAME,
      async (job: Job<SyncJobData>) => {
        return this.processSyncJob(job);
      },
      {
        connection: redisConfig,
        concurrency: 1, // Process one sync job at a time to avoid rate limits
      }
    );

    // Set up event handlers
    this.setupEventHandlers();
  }

  /**
   * Start the worker
   */
  async start(): Promise<void> {
    logger.info('Starting sync worker');
    // Worker starts automatically when instantiated
  }

  /**
   * Stop the worker
   */
  async stop(): Promise<void> {
    logger.info('Stopping sync worker');
    await this.worker.close();
  }

  /**
   * Process a sync job
   */
  private async processSyncJob(job: Job<SyncJobData>): Promise<SyncJobResult> {
    const { tenantId, syncType, channelIds, startDate, endDate } = job.data;
    const startedAt = new Date();

    logger.info('Processing sync job', {
      jobId: job.id,
      tenantId,
      syncType,
    });

    const result: SyncJobResult = {
      tenantId,
      channelsProcessed: 0,
      messagesProcessed: 0,
      reactionsProcessed: 0,
      attachmentsProcessed: 0,
      errors: [],
      startedAt,
      completedAt: new Date(), // Will be updated at the end
    };

    try {
      // Get tenant information
      const tenant = await this.tenantRepo.findById(tenantId);
      if (!tenant) {
        throw new Error(`Tenant not found: ${tenantId}`);
      }

      // Create platform adapter
      const adapter = PlatformAdapterFactory.create(
        tenant.platform as Platform
      );
      await adapter.initialize();

      try {
        // Verify connection
        const isConnected = await adapter.verifyConnection(tenant.platformId);
        if (!isConnected) {
          throw new Error(
            `Failed to verify connection to ${tenant.platform} platform`
          );
        }

        // Sync channels
        await this.syncChannels(adapter, tenant.id, tenant.platformId, result);

        // Get channels to sync messages from
        const channelsToSync =
          channelIds ||
          (await this.channelRepo.findByTenant(tenant.id)).map(
            (c) => c.platformChannelId
          );

        // Sync messages for each channel
        for (const channelId of channelsToSync) {
          await job.updateProgress({
            channelId,
            status: 'syncing',
            channelsProcessed: result.channelsProcessed,
            messagesProcessed: result.messagesProcessed,
          });

          try {
            await this.syncChannelMessages(
              adapter,
              tenant.id,
              channelId,
              { startDate, endDate, syncType },
              result
            );
          } catch (error) {
            // Re-throw rate limit errors to stop the entire job
            if (isRateLimitError(error)) {
              throw error;
            }

            const classifiedError = classifyError(error);
            logger.error('Failed to sync channel messages', {
              channelId,
              error: error instanceof Error ? error.message : 'Unknown error',
              errorType: classifiedError.type,
              errorClassification: classifiedError.classification,
            });
            result.errors.push({
              channelId,
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date(),
            });
          }
        }
      } finally {
        // Always cleanup adapter
        await adapter.cleanup();
      }
    } catch (error) {
      // Check if it's a rate limit error
      if (isRateLimitError(error)) {
        logger.error('Rate limit hit during sync job - exiting immediately', {
          jobId: job.id,
          tenantId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        result.errors.push({
          error: 'Rate limit exceeded - will retry on next scheduled sync',
          timestamp: new Date(),
        });

        // Mark job as failed with a special indicator
        const rateLimitError = new Error('RATE_LIMIT_EXCEEDED');
        (rateLimitError as unknown as Record<string, boolean>).skipRetry = true;
        throw rateLimitError;
      }

      // Classify the error for better logging
      const classifiedError = classifyError(error);

      logger.error('Sync job failed', {
        jobId: job.id,
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: classifiedError.type,
        errorClassification: classifiedError.classification,
        retryable: classifiedError.retryable,
      });

      result.errors.push({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      });

      throw error; // Re-throw to mark job as failed
    }

    result.completedAt = new Date();

    logger.info('Sync job completed', {
      jobId: job.id,
      tenantId,
      result,
    });

    return result;
  }

  /**
   * Sync channels from the platform
   */
  private async syncChannels(
    adapter: PlatformAdapter,
    tenantId: string,
    platformId: string,
    result: SyncJobResult
  ): Promise<void> {
    logger.info('Syncing channels', { tenantId, platformId });

    try {
      // Get channels visible to @everyone from Discord
      const platformChannels = await adapter.fetchChannels(platformId);
      const platformChannelIds = new Set(platformChannels.map((c) => c.id));

      // Get all existing channels from DB for this tenant
      const existingChannels = await this.channelRepo.findByTenantId(tenantId);

      // Find channels that are no longer visible (need to be deleted)
      const channelsToDelete = existingChannels.filter(
        (channel) => !platformChannelIds.has(channel.platformChannelId)
      );

      // Delete channels that are no longer visible to @everyone
      for (const channel of channelsToDelete) {
        try {
          await this.channelRepo.delete(channel.id);
          logger.info('Deleted channel no longer visible to @everyone', {
            channelId: channel.platformChannelId,
            channelName: channel.name,
            tenantId,
          });
        } catch (error) {
          logger.error('Failed to delete channel', {
            channelId: channel.id,
            platformChannelId: channel.platformChannelId,
            error,
          });
          result.errors.push({
            channelId: channel.platformChannelId,
            error: `Failed to delete channel: ${error instanceof Error ? error.message : 'Unknown error'}`,
            timestamp: new Date(),
          });
        }
      }

      // Process visible channels (add or update)
      for (const platformChannel of platformChannels) {
        try {
          // Skip channels that don't have a supported type in the database
          if (!['text', 'thread', 'forum'].includes(platformChannel.type)) {
            logger.debug('Skipping unsupported channel type', {
              channelId: platformChannel.id,
              channelType: platformChannel.type,
            });
            continue;
          }

          // Check if channel already exists
          const existingChannel = await this.channelRepo.findByPlatformId(
            tenantId,
            platformChannel.id
          );

          if (existingChannel) {
            // Update existing channel
            await this.channelRepo.update(existingChannel.id, {
              name: platformChannel.name,
              type: platformChannel.type as ChannelType,
              parentChannelId: platformChannel.parentId || null,
              metadata: platformChannel.metadata || {},
            });
          } else {
            // Create new channel
            await this.channelRepo.create({
              tenantId,
              platformChannelId: platformChannel.id,
              name: platformChannel.name,
              type: platformChannel.type as ChannelType,
              parentChannelId: platformChannel.parentId || null,
              metadata: platformChannel.metadata || {},
            });
            logger.info('Added new channel visible to @everyone', {
              channelId: platformChannel.id,
              channelName: platformChannel.name,
              tenantId,
            });
          }

          result.channelsProcessed++;
        } catch (error) {
          logger.error('Failed to sync channel', {
            channelId: platformChannel.id,
            error,
          });
          result.errors.push({
            channelId: platformChannel.id,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date(),
          });
        }
      }
    } catch (error) {
      logger.error('Failed to fetch channels', { error });
      throw error;
    }
  }

  /**
   * Sync messages for a specific channel
   */
  private async syncChannelMessages(
    adapter: PlatformAdapter,
    tenantId: string,
    platformChannelId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      syncType: 'full' | 'incremental';
    },
    result: SyncJobResult
  ): Promise<void> {
    logger.info('Syncing messages for channel', {
      tenantId,
      platformChannelId,
      options,
    });

    // Get internal channel ID
    const channel = await this.channelRepo.findByPlatformId(
      tenantId,
      platformChannelId
    );
    if (!channel) {
      throw new Error(`Channel not found: ${platformChannelId}`);
    }

    // Get last sync progress for incremental sync
    let lastMessageId: string | undefined;
    if (options.syncType === 'incremental') {
      const progress = await this.progressRepo.findByTenantAndChannel(
        tenantId,
        channel.id
      );
      if (progress) {
        lastMessageId = progress.lastSyncedMessageId;
      }
    }

    // Update sync progress to in_progress
    await this.progressRepo.upsert({
      tenantId,
      channelId: channel.id,
      lastSyncedMessageId: lastMessageId || '',
      lastSyncedAt: new Date(),
      status: 'in_progress',
    });

    try {
      let hasMore = true;
      let afterMessageId = lastMessageId;

      while (hasMore) {
        logger.debug('Fetching messages batch', {
          channelId: platformChannelId,
          afterMessageId,
          iteration: result.messagesProcessed,
        });

        const fetchResult = await adapter.fetchMessages(platformChannelId, {
          afterMessageId,
          afterTimestamp: options.startDate,
          beforeTimestamp: options.endDate,
          limit: 100,
        });

        logger.debug('Fetch result received', {
          channelId: platformChannelId,
          messageCount: fetchResult.messages.length,
          hasMore: fetchResult.hasMore,
          checkpointId: fetchResult.checkpoint?.lastMessageId,
        });

        // Process messages
        for (const platformMessage of fetchResult.messages) {
          try {
            await this.processMessage(channel.id, platformMessage, result);
          } catch (error) {
            logger.error('Failed to process message', {
              messageId: platformMessage.id,
              error,
            });
            result.errors.push({
              channelId: platformChannelId,
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date(),
            });
          }
        }

        // Update progress
        if (fetchResult.checkpoint) {
          await this.progressRepo.upsert({
            tenantId,
            channelId: channel.id,
            lastSyncedMessageId: fetchResult.checkpoint.lastMessageId,
            lastSyncedAt: fetchResult.checkpoint.lastMessageTimestamp,
            status: 'in_progress',
          });
          afterMessageId = fetchResult.checkpoint.lastMessageId;
        }

        hasMore = fetchResult.hasMore;

        logger.debug('Batch complete', {
          channelId: platformChannelId,
          hasMore,
          nextAfterMessageId: afterMessageId,
          totalMessagesProcessed: result.messagesProcessed,
        });
      }

      // Mark sync as completed
      const finalProgress = await this.progressRepo.findByTenantAndChannel(
        tenantId,
        channel.id
      );
      if (finalProgress) {
        await this.progressRepo.update(finalProgress.id, {
          status: 'completed',
        });
      }
    } catch (error) {
      // Mark sync as failed
      const failedProgress = await this.progressRepo.findByTenantAndChannel(
        tenantId,
        channel.id
      );
      if (failedProgress) {
        await this.progressRepo.update(failedProgress.id, {
          status: 'failed',
          errorDetails:
            error instanceof Error ? error.message : 'Unknown error',
        });
      }
      throw error;
    }
  }

  /**
   * Process a single message
   */
  private async processMessage(
    channelId: string,
    platformMessage: PlatformMessage,
    result: SyncJobResult
  ): Promise<void> {
    // Check if message already exists
    const existingMessage = await this.messageRepo.findByPlatformId(
      channelId,
      platformMessage.id
    );

    if (!existingMessage) {
      // Create new message with anonymized author ID
      const anonymizedAuthorId = anonymizeUserId(platformMessage.authorId);

      const message = await this.messageRepo.create({
        channelId,
        platformMessageId: platformMessage.id,
        anonymizedAuthorId,
        content: platformMessage.content,
        replyToId: platformMessage.replyToId || null,
        metadata: platformMessage.metadata || {},
        platformCreatedAt: platformMessage.createdAt,
      });

      result.messagesProcessed++;

      // Process reactions
      if (platformMessage.reactions) {
        for (const reaction of platformMessage.reactions) {
          for (const userId of reaction.users) {
            try {
              await this.reactionRepo.create({
                messageId: message.id,
                emoji: reaction.emoji,
                anonymizedUserId: anonymizeUserId(userId),
              });
              result.reactionsProcessed++;
            } catch (error) {
              // Ignore duplicate reaction errors
              if (
                error instanceof Error &&
                !error.message?.includes('duplicate')
              ) {
                throw error;
              }
            }
          }
        }
      }

      // Process attachments
      if (platformMessage.attachments) {
        for (const attachment of platformMessage.attachments) {
          await this.attachmentRepo.create({
            messageId: message.id,
            filename: attachment.filename,
            fileSize: BigInt(attachment.fileSize),
            contentType: attachment.contentType,
            url: attachment.url,
          });
          result.attachmentsProcessed++;
        }
      }
    }
  }

  /**
   * Setup event handlers for the worker
   */
  private setupEventHandlers(): void {
    this.worker.on('completed', (job) => {
      logger.info('Sync job completed', {
        jobId: job.id,
        tenantId: job.data.tenantId,
      });
    });

    this.worker.on('failed', (job, error) => {
      // Check if it's a rate limit error that should skip retry
      const isRateLimit =
        error instanceof Error &&
        (error.message === 'RATE_LIMIT_EXCEEDED' ||
          (error as unknown as Record<string, unknown>).skipRetry);

      logger.error('Sync job failed', {
        jobId: job?.id,
        tenantId: job?.data.tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
        isRateLimit,
        willRetry: !isRateLimit && job?.attemptsMade && job.attemptsMade < 3,
      });
    });

    this.worker.on('progress', (job, progress) => {
      logger.debug('Sync job progress', {
        jobId: job.id,
        tenantId: job.data.tenantId,
        progress,
      });
    });

    this.worker.on('error', (error) => {
      logger.error('Worker error', { error });
    });
  }
}
