/**
 * Worker for processing hourly sync trigger jobs
 */

import { Worker, type Job } from 'bullmq';
import { syncQueue, SYNC_QUEUE_NAME } from '../queues/syncQueue.js';
import { addGoldenAnswerEmbeddingJob, addMessageEmbeddingJob } from '../queues/analysisQueue.js';
import { TenantRepositoryImpl } from '../repositories/tenant/index.js';
import { db } from '../database/index.js';
import logger from '../utils/logger.js';
import { redisConfig } from '../config/redis.js';
import type { SyncJobData } from '../types/sync.js';

/**
 * Hourly trigger worker implementation
 */
export class HourlyTriggerWorker {
  private worker: Worker;
  private tenantRepo: TenantRepositoryImpl;

  constructor() {
    this.tenantRepo = new TenantRepositoryImpl(db);

    // Create the worker to process hourly sync triggers
    this.worker = new Worker(
      SYNC_QUEUE_NAME,
      async (job: Job) => {
        if (job.name === 'hourly-sync-trigger') {
          await this.runHourlySync();
        }
        // Let other jobs pass through to be handled by syncWorker
        return;
      },
      {
        connection: redisConfig,
        concurrency: 1,
      }
    );

    this.setupEventHandlers();
  }

  /**
   * Start the worker
   */
  async start(): Promise<void> {
    logger.info('Starting hourly trigger worker');
    // Worker starts automatically when instantiated
  }

  /**
   * Stop the worker
   */
  async stop(): Promise<void> {
    logger.info('Stopping hourly trigger worker');
    await this.worker.close();
  }

  /**
   * Run the hourly sync for all active Discord tenants
   */
  private async runHourlySync(): Promise<void> {
    logger.info('Running hourly sync for all active Discord tenants');

    try {
      // Get all tenants and filter for active Discord ones
      const allTenants = await this.tenantRepo.findAll();
      const discordTenants = allTenants.data.filter(
        (tenant) => tenant.status === 'ACTIVE' && tenant.platform === 'discord'
      );

      logger.info(
        `Found ${discordTenants.length} active Discord tenants to sync`
      );

      // Queue sync jobs for each tenant
      const syncPromises = discordTenants.map(async (tenant) => {
        try {
          const jobData: SyncJobData = {
            tenantId: tenant.id,
            syncType: 'incremental',
          };

          const job = await syncQueue.add(`sync-tenant`, jobData, {
            // Deduplicate by tenant ID to prevent overlapping syncs
            jobId: `scheduled-sync-${tenant.id}-${Date.now()}`,
            removeOnComplete: {
              age: 24 * 3600, // Keep for 24 hours
              count: 100, // Keep last 100
            },
            removeOnFail: {
              age: 7 * 24 * 3600, // Keep for 7 days
            },
          });

          logger.info('Queued scheduled sync job', {
            jobId: job.id,
            tenantId: tenant.id,
            tenantName: tenant.name,
          });
        } catch (error) {
          logger.error('Failed to queue sync job for tenant', {
            tenantId: tenant.id,
            error,
          });
        }
      });

      await Promise.all(syncPromises);

      logger.info('Hourly sync jobs queued successfully');

      // Queue golden answer embedding generation for all active tenants
      logger.info('Queueing golden answer embedding generation jobs');
      
      const embeddingPromises = discordTenants.map(async (tenant) => {
        try {
          const jobId = await addGoldenAnswerEmbeddingJob({
            tenantId: tenant.id,
          });

          logger.info('Queued golden answer embedding job', {
            jobId,
            tenantId: tenant.id,
            tenantName: tenant.name,
          });
        } catch (error) {
          logger.error('Failed to queue golden answer embedding job', {
            tenantId: tenant.id,
            error,
          });
        }
      });

      await Promise.all(embeddingPromises);
      
      logger.info('Golden answer embedding jobs queued successfully');

      // Queue message embedding generation for all active tenants
      logger.info('Queueing message embedding generation jobs');
      
      const messageEmbeddingPromises = discordTenants.map(async (tenant) => {
        try {
          const jobId = await addMessageEmbeddingJob({
            tenantId: tenant.id,
          });

          logger.info('Queued message embedding job', {
            jobId,
            tenantId: tenant.id,
            tenantName: tenant.name,
          });
        } catch (error) {
          logger.error('Failed to queue message embedding job', {
            tenantId: tenant.id,
            error,
          });
        }
      });

      await Promise.all(messageEmbeddingPromises);
      
      logger.info('Message embedding jobs queued successfully');
    } catch (error) {
      logger.error('Failed to run hourly sync', { error });
    }
  }

  /**
   * Setup event handlers for the worker
   */
  private setupEventHandlers(): void {
    this.worker.on('completed', (job) => {
      if (job.name === 'hourly-sync-trigger') {
        logger.info('Hourly sync trigger completed', {
          jobId: job.id,
        });
      }
    });

    this.worker.on('failed', (job, error) => {
      if (job?.name === 'hourly-sync-trigger') {
        logger.error('Hourly sync trigger failed', {
          jobId: job?.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    this.worker.on('error', (error) => {
      logger.error('Hourly trigger worker error', { error });
    });
  }
}
