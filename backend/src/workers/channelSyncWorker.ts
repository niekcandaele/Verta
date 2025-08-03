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
  }

  /**
   * Stop the worker
   */
  async stop(): Promise<void> {
    logger.info('Stopping channel sync worker', { workerId: this.workerId });
    await this.worker.close();
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

      // Get platform adapter
      const adapter = PlatformAdapterFactory.create(
        tenant.platform as Platform
      );

      // Initialize the adapter
      await adapter.initialize();

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
        // Always cleanup adapter
        await adapter.cleanup();
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
    _tenantId: string
  ): Promise<number> {
    if (messages.length === 0) return 0;

    // Prepare message data
    const messageData = messages.map((msg) => ({
      channelId,
      platformMessageId: msg.id,
      anonymizedAuthorId: anonymizeUserId(msg.authorId),
      content: msg.content,
      replyToId: msg.replyToId || null,
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
    }));

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

          await this.attachmentRepo.bulkCreate(attachmentData);
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
