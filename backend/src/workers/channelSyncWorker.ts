/**
 * BullMQ worker for processing individual channel sync jobs in parallel
 */

import { Worker, type Job } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';
import { redisConfig } from '../config/redis.js';
import { config } from '../config/env.js';
import {
  CHANNEL_SYNC_QUEUE_NAME,
  type ChannelSyncJobData,
} from '../queues/channelSyncQueue.js';
import { PlatformAdapterFactory } from '../adapters/index.js';
import type { PlatformAdapter } from '../adapters/types.js';
import { db } from '../database/index.js';
import type { TenantRepository } from '../repositories/tenant/index.js';
import { TenantRepositoryImpl } from '../repositories/tenant/index.js';
import {
  MessageRepository,
  MessageEmojiReactionRepository,
  MessageAttachmentRepository,
  SyncProgressRepository,
} from '../repositories/sync/index.js';
import { anonymizeUserId } from '../utils/crypto.js';
import type { PlatformMessage, ChannelSyncState } from '../types/sync.js';
import type { Platform } from '../database/types.js';
import { addOcrJobsBatch } from '../queues/ocrQueue.js';

/**
 * Channel sync worker implementation
 */
export class ChannelSyncWorker {
  private worker: Worker<ChannelSyncJobData, ChannelSyncState>;
  private workerId: string;
  private tenantRepo: TenantRepository;
  private messageRepo: MessageRepository;
  private reactionRepo: MessageEmojiReactionRepository;
  private attachmentRepo: MessageAttachmentRepository;
  private progressRepo: SyncProgressRepository;
  private platformAdapters: Map<Platform, PlatformAdapter> = new Map();

  constructor() {
    // Generate unique worker ID
    this.workerId = `channel-worker-${uuidv4().substring(0, 8)}`;

    // Initialize repositories
    this.tenantRepo = new TenantRepositoryImpl(db);
    this.messageRepo = new MessageRepository(db);
    this.reactionRepo = new MessageEmojiReactionRepository(db);
    this.attachmentRepo = new MessageAttachmentRepository(db);
    this.progressRepo = new SyncProgressRepository(db);

    // Create the worker with concurrency from config
    this.worker = new Worker<ChannelSyncJobData, ChannelSyncState>(
      CHANNEL_SYNC_QUEUE_NAME,
      async (job: Job<ChannelSyncJobData>) => {
        return this.processChannel(job);
      },
      {
        connection: redisConfig,
        concurrency: config.SYNC_MAX_CHANNEL_WORKERS || 10,
      }
    );

    // Set up event handlers
    this.setupEventHandlers();
  }

  /**
   * Start the worker
   */
  async start(): Promise<void> {
    logger.info('Starting channel sync worker', {
      workerId: this.workerId,
      concurrency: config.SYNC_MAX_CHANNEL_WORKERS,
    });

    // Initialize platform adapters
    await this.initializePlatformAdapters();
  }

  /**
   * Stop the worker
   */
  async stop(): Promise<void> {
    logger.info('Stopping channel sync worker', { workerId: this.workerId });
    await this.worker.close();

    // Cleanup adapters (they won't destroy the shared Discord client)
    for (const [platform, adapter] of this.platformAdapters.entries()) {
      logger.debug(`Cleaning up ${platform} adapter`);
      await adapter.cleanup();
    }
    this.platformAdapters.clear();
  }

  /**
   * Process a single channel sync job
   */
  private async processChannel(
    job: Job<ChannelSyncJobData>
  ): Promise<ChannelSyncState> {
    const {
      tenantId,
      channelId,
      platformChannelId,
      syncType,
      startDate,
      endDate,
      parentJobId,
    } = job.data;

    const startedAt = new Date();
    let messagesProcessed = 0;
    let lastMessageId: string | undefined;

    logger.info('Processing channel sync job', {
      jobId: job.id,
      workerId: this.workerId,
      tenantId,
      channelId,
      platformChannelId,
      syncType,
    });

    try {
      // 1. Claim channel for this worker
      const claimedChannel = await this.progressRepo.claimChannel(
        channelId,
        this.workerId
      );

      if (!claimedChannel) {
        logger.warn('Could not claim channel, already being processed', {
          channelId,
          workerId: this.workerId,
        });
        return {
          channelId,
          status: 'failed',
          workerId: this.workerId,
          startedAt,
          completedAt: new Date(),
          messagesProcessed: 0,
          error: 'Channel already being processed',
          retryCount: 0,
        };
      }

      // 2. Get tenant configuration
      const tenant = await this.tenantRepo.findById(tenantId);
      if (!tenant) {
        throw new Error(`Tenant not found: ${tenantId}`);
      }

      // Get or create platform adapter (reuse existing instance)
      const adapter = await this.getOrCreateAdapter(
        tenant.platform as Platform
      );

      try {
        // 3. Get last checkpoint for incremental sync
        if (syncType === 'incremental') {
          const progress = await this.progressRepo.findByTenantAndChannel(
            tenantId,
            channelId
          );
          if (progress) {
            lastMessageId = progress.lastSyncedMessageId;
          }
        }

        // 4. Fetch and process messages in batches
        let hasMore = true;
        let afterMessageId = lastMessageId;
        const messageFetchSize = config.SYNC_MESSAGE_FETCH_SIZE || 100;

        while (hasMore) {
          logger.debug('Fetching messages batch', {
            channelId: platformChannelId,
            afterMessageId,
            batchSize: messageFetchSize,
          });

          // Update job progress
          await job.updateProgress({
            messagesProcessed,
            currentBatch: afterMessageId,
          });

          // Fetch messages (Discord.js handles rate limiting)
          const fetchResult = await adapter.fetchMessages(platformChannelId, {
            afterMessageId,
            limit: messageFetchSize,
            startDate,
            endDate,
          });

          if (fetchResult.messages.length === 0) {
            hasMore = false;
            break;
          }

          // Process messages batch
          const processedCount = await this.processMessageBatch(
            fetchResult.messages,
            channelId,
            tenantId
          );

          messagesProcessed += processedCount;

          // Update checkpoint
          if (fetchResult.checkpoint) {
            afterMessageId = fetchResult.checkpoint.lastMessageId;
            hasMore = fetchResult.checkpoint.hasMoreMessages;

            // Update progress in database
            await this.progressRepo.update(channelId, {
              lastSyncedMessageId: afterMessageId,
              lastSyncedAt: new Date(),
            });
          } else {
            hasMore = false;
          }

          // Log progress metrics
          if (messagesProcessed % 1000 === 0 && messagesProcessed > 0) {
            const currentTime = new Date().getTime();
            const elapsedSeconds = (currentTime - startedAt.getTime()) / 1000;
            const currentMessagesPerSecond = messagesProcessed / elapsedSeconds;

            logger.info('Channel sync progress', {
              context: 'sync-metrics',
              jobId: job.id,
              parentJobId,
              tenantId,
              channelId: platformChannelId,
              workerId: this.workerId,
              metrics: {
                messagesProcessed,
                elapsedSeconds,
                messagesPerSecond: currentMessagesPerSecond,
                status: 'in_progress',
              },
            });
          }
        }

        // 5. Mark channel sync as completed
        await this.progressRepo.markCompleted(
          channelId,
          afterMessageId || '',
          new Date()
        );

        const completedAt = new Date();
        const duration = completedAt.getTime() - startedAt.getTime();
        const messagesPerSecond = messagesProcessed / (duration / 1000);

        // Log structured metrics
        logger.info('Channel sync completed', {
          context: 'sync-metrics',
          jobId: job.id,
          parentJobId,
          tenantId,
          channelId: platformChannelId,
          workerId: this.workerId,
          metrics: {
            messagesProcessed,
            duration,
            messagesPerSecond,
            status: 'completed',
            retryCount: job.attemptsMade,
          },
        });

        return {
          channelId,
          status: 'completed',
          workerId: this.workerId,
          startedAt,
          completedAt,
          messagesProcessed,
          lastMessageId: afterMessageId,
          retryCount: 0,
        };
      } finally {
        // Don't cleanup adapter - it's shared across jobs
        // Cleanup only happens when worker stops
      }
    } catch (error) {
      logger.error('Channel sync failed', {
        channelId: platformChannelId,
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        workerId: this.workerId,
      });

      // Mark channel sync as failed
      await this.progressRepo.markFailed(channelId, error);

      // Release channel from worker
      await this.progressRepo.releaseChannel(channelId, this.workerId);

      return {
        channelId,
        status: 'failed',
        workerId: this.workerId,
        startedAt,
        completedAt: new Date(),
        messagesProcessed,
        lastMessageId,
        error: error instanceof Error ? error.message : 'Unknown error',
        retryCount: job.attemptsMade,
      };
    }
  }

  /**
   * Process a batch of messages
   */
  private async processMessageBatch(
    messages: PlatformMessage[],
    channelId: string,
    tenantId: string
  ): Promise<number> {
    if (messages.length === 0) return 0;

    // Prepare message data, looking up internal IDs for replies
    const messageDataPromises = messages.map(async (msg) => {
      // Look up internal message ID if this is a reply
      let replyToId: string | null = null;
      if (msg.replyToId) {
        const replyToMessage = await this.messageRepo.findByPlatformId(
          channelId,
          msg.replyToId
        );
        replyToId = replyToMessage?.id || null;
      }

      return {
        channelId,
        platformMessageId: msg.id,
        anonymizedAuthorId: anonymizeUserId(msg.authorId),
        content: msg.content,
        replyToId,
        metadata: msg.metadata
          ? {
              ...msg.metadata,
              mentions: (msg.metadata as any).mentions
                ? {
                    ...(msg.metadata as any).mentions,
                    // Anonymize user IDs in mentions to match anonymizedAuthorId format
                    users: ((msg.metadata as any).mentions.users || []).map(
                      (userId: string) => anonymizeUserId(userId)
                    ),
                    // Keep channels and roles as-is for proper lookup
                  }
                : (msg.metadata as any).mentions,
            }
          : {},
        platformCreatedAt: msg.createdAt,
      };
    });

    const messageData = await Promise.all(messageDataPromises);

    // Bulk upsert messages
    const { created, skipped } = await this.messageRepo.bulkUpsert(messageData);

    // Process reactions and attachments for created messages
    for (let i = 0; i < messages.length; i++) {
      const platformMessage = messages[i];
      const createdMessage = created.find(
        (m) => m.platformMessageId === platformMessage.id
      );

      if (createdMessage) {
        // Process reactions
        if (platformMessage.reactions && platformMessage.reactions.length > 0) {
          const reactionData = platformMessage.reactions.flatMap((reaction) =>
            reaction.users.map((userId) => ({
              messageId: createdMessage.id,
              emoji: reaction.emoji,
              anonymizedUserId: anonymizeUserId(userId),
            }))
          );

          await this.reactionRepo.bulkCreate(reactionData);
        }

        // Process attachments
        if (
          platformMessage.attachments &&
          platformMessage.attachments.length > 0
        ) {
          const attachmentData = platformMessage.attachments.map(
            (attachment) => ({
              messageId: createdMessage.id,
              filename: attachment.filename,
              fileSize: attachment.fileSize,
              contentType: attachment.contentType,
              url: attachment.url,
            })
          );

          const createdAttachments = await this.attachmentRepo.bulkCreate(attachmentData);

          // Queue OCR jobs for image attachments
          const imageAttachments = createdAttachments.filter((_attachment, index) => {
            const contentType = platformMessage.attachments![index].contentType;
            return this.isImageContentType(contentType);
          });

          if (imageAttachments.length > 0) {
            const ocrJobs = imageAttachments.map((attachment) => ({
              data: {
                tenantId: tenantId,
                messageId: createdMessage.id,
                attachmentId: attachment.id,
                attachmentUrl: platformMessage.attachments![
                  attachmentData.findIndex(a => a.messageId === attachment.messageId && a.filename === attachment.filename)
                ].url,
                attachmentFilename: attachment.filename,
              },
            }));

            try {
              const jobIds = await addOcrJobsBatch(ocrJobs);
              logger.debug('Queued OCR jobs for image attachments', {
                messageId: createdMessage.id,
                attachmentCount: imageAttachments.length,
                jobIds,
              });
            } catch (error) {
              logger.error('Failed to queue OCR jobs', {
                messageId: createdMessage.id,
                error,
              });
            }
          }
        }
      }
    }

    logger.debug('Processed message batch', {
      channelId,
      total: messages.length,
      created: created.length,
      skipped,
    });

    return messages.length;
  }

  /**
   * Initialize platform adapters for reuse across jobs
   */
  private async initializePlatformAdapters(): Promise<void> {
    // Pre-create and initialize adapters for known platforms
    const platforms: Platform[] = ['discord']; // Add more platforms as needed

    for (const platform of platforms) {
      try {
        const adapter = PlatformAdapterFactory.create(platform);
        await adapter.initialize();
        this.platformAdapters.set(platform, adapter);
        logger.info(`Initialized ${platform} adapter for worker`, {
          workerId: this.workerId,
          platform,
        });
      } catch (error) {
        logger.error(`Failed to initialize ${platform} adapter`, {
          workerId: this.workerId,
          platform,
          error,
        });
      }
    }
  }

  /**
   * Get or create a platform adapter
   */
  private async getOrCreateAdapter(
    platform: Platform
  ): Promise<PlatformAdapter> {
    // Check if we already have an adapter for this platform
    let adapter = this.platformAdapters.get(platform);

    if (!adapter) {
      // Create and initialize a new adapter if we don't have one
      logger.info(`Creating new ${platform} adapter`, {
        workerId: this.workerId,
        platform,
      });

      adapter = PlatformAdapterFactory.create(platform);
      await adapter.initialize();
      this.platformAdapters.set(platform, adapter);
    }

    return adapter;
  }

  /**
   * Check if content type is an image that should be processed with OCR
   */
  private isImageContentType(contentType: string): boolean {
    const imageTypes = [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/gif',
      'image/webp',
      'image/bmp',
      'image/tiff',
      'image/svg+xml',
    ];
    
    // Check exact match or starts with image/
    return imageTypes.includes(contentType.toLowerCase()) || 
           contentType.toLowerCase().startsWith('image/');
  }

  /**
   * Set up event handlers for the worker
   */
  private setupEventHandlers(): void {
    this.worker.on('completed', (job, result) => {
      logger.info('Channel sync job completed', {
        jobId: job.id,
        channelId: result.channelId,
        messagesProcessed: result.messagesProcessed,
        workerId: this.workerId,
      });
    });

    this.worker.on('failed', (job, err) => {
      logger.error('Channel sync job failed', {
        jobId: job?.id,
        error: err,
        workerId: this.workerId,
      });
    });

    this.worker.on('error', (err) => {
      logger.error('Channel sync worker error', {
        error: err,
        workerId: this.workerId,
      });
    });
  }
}
