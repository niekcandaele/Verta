/**
 * BullMQ worker for processing platform sync jobs
 */

import { Worker, type Job } from 'bullmq';
import logger from '../utils/logger.js';
import { redisConfig } from '../config/redis.js';
import { SYNC_QUEUE_NAME } from '../queues/syncQueue.js';
import {
  channelSyncQueue,
  type ChannelSyncJobData,
} from '../queues/channelSyncQueue.js';
import { PlatformAdapterFactory } from '../adapters/index.js';
import type { PlatformAdapter } from '../adapters/types.js';
import { db } from '../database/index.js';
import type { TenantRepository } from '../repositories/tenant/index.js';
import { TenantRepositoryImpl } from '../repositories/tenant/index.js';
import {
  ChannelRepository,
  ChannelSyncJobRepository,
} from '../repositories/sync/index.js';
import type { SyncJobData, SyncJobResult } from '../types/sync.js';
import type { Platform, ChannelType } from '../database/types.js';
import { isRateLimitError, classifyError } from '../types/errors.js';
import { config } from '../config/env.js';

/**
 * Sync worker implementation
 */
export class SyncWorker {
  private worker: Worker<SyncJobData, SyncJobResult>;
  private tenantRepo: TenantRepository;
  private channelRepo: ChannelRepository;
  private channelSyncJobRepo: ChannelSyncJobRepository;

  constructor() {
    // Initialize repositories
    this.tenantRepo = new TenantRepositoryImpl(db);
    this.channelRepo = new ChannelRepository(db);
    this.channelSyncJobRepo = new ChannelSyncJobRepository(db);

    // Create the worker
    this.worker = new Worker<SyncJobData, SyncJobResult>(
      SYNC_QUEUE_NAME,
      async (job: Job<SyncJobData>) => {
        // Skip hourly-sync-trigger jobs - they should be handled by HourlyTriggerWorker
        if (job.name === 'hourly-sync-trigger') {
          logger.warn('Skipping hourly-sync-trigger job in SyncWorker', {
            jobId: job.id,
          });
          return {
            tenantId: '',
            channelsProcessed: 0,
            messagesProcessed: 0,
            reactionsProcessed: 0,
            attachmentsProcessed: 0,
            errors: [],
            startedAt: new Date(),
            completedAt: new Date(),
          };
        }
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
          (await this.channelRepo.findByTenant(tenant.id)).map((c) => ({
            id: c.id,
            platformChannelId: c.platformChannelId,
          }));

        // Create channel sync jobs
        const channelJobs: ChannelSyncJobData[] = channelsToSync.map(
          (channel) => ({
            tenantId: tenant.id,
            channelId: typeof channel === 'string' ? channel : channel.id,
            platformChannelId:
              typeof channel === 'string' ? channel : channel.platformChannelId,
            syncType,
            startDate,
            endDate,
            parentJobId: job.id!,
          })
        );

        logger.info('Dispatching channel sync jobs', {
          jobId: job.id,
          channelCount: channelJobs.length,
        });

        // Add channel jobs to queue in batches
        const batchSize = config.SYNC_CHANNEL_BATCH_SIZE || 5;
        for (let i = 0; i < channelJobs.length; i += batchSize) {
          const batch = channelJobs.slice(i, i + batchSize);
          await channelSyncQueue.addBulk(
            batch.map((data) => ({
              name: 'sync-channel',
              data,
              opts: {
                priority: 1, // Normal priority
              },
            }))
          );
        }

        // Monitor channel progress
        const finalResult = await this.monitorChannelProgress(
          job,
          channelJobs,
          result
        );

        return finalResult;
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
   * Monitor channel sync progress
   */
  private async monitorChannelProgress(
    job: Job<SyncJobData>,
    channelJobs: ChannelSyncJobData[],
    initialResult: SyncJobResult
  ): Promise<SyncJobResult> {
    const result = { ...initialResult };
    const startTime = Date.now();
    const pollInterval = 5000; // 5 seconds
    let completedChannels = 0;
    let failedChannels = 0;

    logger.info('Starting channel progress monitoring', {
      parentJobId: job.id,
      totalChannels: channelJobs.length,
    });

    // Continue monitoring until all channels are completed or failed
    while (completedChannels + failedChannels < channelJobs.length) {
      // Get status of all channel jobs
      const channelJobStatuses =
        await this.channelSyncJobRepo.findByParentJobId(job.id!);

      // Count completed and failed
      completedChannels = channelJobStatuses.filter(
        (j) => j.status === 'completed'
      ).length;
      failedChannels = channelJobStatuses.filter(
        (j) => j.status === 'failed'
      ).length;
      const inProgress = channelJobStatuses.filter(
        (j) => j.status === 'in_progress'
      ).length;

      // Aggregate statistics
      result.messagesProcessed = channelJobStatuses.reduce(
        (sum, j) => sum + j.messagesProcessed,
        0
      );

      // Update job progress
      await job.updateProgress({
        channelsTotal: channelJobs.length,
        channelsCompleted: completedChannels,
        channelsFailed: failedChannels,
        channelsInProgress: inProgress,
        messagesProcessed: result.messagesProcessed,
      });

      // Log periodic metrics
      const elapsed = (Date.now() - startTime) / 1000;
      if (elapsed > 0) {
        logger.info('Sync job progress', {
          context: 'sync-metrics',
          jobId: job.id,
          tenantId: job.data.tenantId,
          metrics: {
            elapsedSeconds: elapsed,
            channelsTotal: channelJobs.length,
            channelsCompleted: completedChannels,
            channelsFailed: failedChannels,
            channelsInProgress: inProgress,
            messagesProcessed: result.messagesProcessed,
            messagesPerSecond: result.messagesProcessed / elapsed,
            channelsPerMinute: (completedChannels / elapsed) * 60,
            concurrentChannels: inProgress,
            status: 'in_progress',
          },
        });
      }

      // Check if all channels are done
      if (completedChannels + failedChannels >= channelJobs.length) {
        break;
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    // Calculate final statistics
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000; // seconds
    const channelJobStatuses = await this.channelSyncJobRepo.findByParentJobId(
      job.id!
    );

    // Aggregate channel results
    result.channelResults = channelJobStatuses.map((j) => ({
      channelId: j.channelId,
      status: j.status,
      workerId: j.workerId,
      startedAt: j.startedAt,
      completedAt: j.completedAt,
      messagesProcessed: j.messagesProcessed,
      lastMessageId: undefined, // Would need to get from sync progress
      error: j.errorDetails ? JSON.stringify(j.errorDetails) : undefined,
      retryCount: 0,
    }));

    // Add parallel statistics
    result.parallelStats = {
      maxConcurrentChannels: config.SYNC_MAX_CHANNEL_WORKERS || 10,
      averageChannelTime:
        completedChannels > 0 ? duration / completedChannels : 0,
      totalApiCalls: 0, // Would need to track this
      rateLimitEncounters: 0, // Would need to track this
    };

    // Add errors from failed channels
    const failedJobs = channelJobStatuses.filter((j) => j.status === 'failed');
    for (const failedJob of failedJobs) {
      result.errors.push({
        channelId: failedJob.channelId,
        error: failedJob.errorDetails
          ? JSON.stringify(failedJob.errorDetails)
          : 'Channel sync failed',
        timestamp: failedJob.completedAt || new Date(),
      });
    }

    result.channelsProcessed = completedChannels;
    result.completedAt = new Date();

    // Log final sync metrics
    logger.info('Sync job completed', {
      context: 'sync-metrics',
      jobId: job.id,
      tenantId: job.data.tenantId,
      metrics: {
        duration,
        channelsTotal: channelJobs.length,
        channelsProcessed: completedChannels,
        channelsFailed: failedChannels,
        messagesProcessed: result.messagesProcessed,
        messagesPerSecond: result.messagesProcessed / duration,
        channelsPerMinute: (completedChannels / duration) * 60,
        maxConcurrentChannels: config.SYNC_MAX_CHANNEL_WORKERS || 10,
        averageChannelTime:
          completedChannels > 0 ? duration / completedChannels : 0,
        status: 'completed',
      },
    });

    // Cleanup old channel sync jobs
    await this.cleanupOldChannelSyncJobs();

    return result;
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

  /**
   * Cleanup old channel sync job records
   */
  private async cleanupOldChannelSyncJobs(): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7); // 7 days ago

      const result = await (db as any)
        .deleteFrom('channel_sync_jobs')
        .where('status', '=', 'completed')
        .where('completed_at', '<', cutoffDate.toISOString())
        .executeTakeFirst();

      const deletedCount = Number(result.numDeletedRows);

      if (deletedCount > 0) {
        logger.info('Cleaned up old channel sync job records', {
          deletedCount,
          cutoffDate,
        });
      }
    } catch (error) {
      logger.error('Failed to cleanup old channel sync jobs', { error });
      // Don't throw - cleanup is not critical
    }
  }
}
