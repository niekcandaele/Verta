/**
 * Export worker for processing export jobs
 */

import { Worker, Job } from 'bullmq';
import { db } from '../database/index.js';
import { getRedisConnection } from '../config/redis.js';
import {
  TenantRepositoryImpl,
  TenantBrandingRepositoryImpl,
} from '../repositories/tenant/index.js';
import { DataExportServiceImpl } from '../services/dataExport/index.js';
import logger from '../utils/logger.js';
import type {
  ExportTenantJobData,
  ExportAllTenantsJobData,
} from '../routes/export.js';

// Import concrete implementations
import {
  ChannelRepository,
  MessageRepository,
  MessageEmojiReactionRepository,
  MessageAttachmentRepository,
} from '../repositories/sync/index.js';

// Job names
const EXPORT_TENANT_JOB = 'export-tenant';
const EXPORT_ALL_TENANTS_JOB = 'export-all-tenants';

export class ExportWorker {
  private worker: Worker;
  private tenantRepository: TenantRepositoryImpl;
  private tenantBrandingRepository: TenantBrandingRepositoryImpl;
  private channelRepository: ChannelRepository;
  private messageRepository: MessageRepository;
  private reactionRepository: MessageEmojiReactionRepository;
  private attachmentRepository: MessageAttachmentRepository;
  private exportService: DataExportServiceImpl;

  constructor() {
    // Initialize repositories
    this.tenantRepository = new TenantRepositoryImpl(db);
    this.tenantBrandingRepository = new TenantBrandingRepositoryImpl(db);
    this.channelRepository = new ChannelRepository(db);
    this.messageRepository = new MessageRepository(db);
    this.reactionRepository = new MessageEmojiReactionRepository(db);
    this.attachmentRepository = new MessageAttachmentRepository(db);

    // Initialize export service
    this.exportService = new DataExportServiceImpl(
      this.tenantRepository,
      this.tenantBrandingRepository,
      this.channelRepository,
      this.messageRepository,
      this.reactionRepository,
      this.attachmentRepository
    );

    // Create worker
    this.worker = new Worker(
      'export',
      async (job: Job) => {
        // Process based on job type
        switch (job.name) {
          case EXPORT_TENANT_JOB:
            return this.handleExportTenant(job as Job<ExportTenantJobData>);
          case EXPORT_ALL_TENANTS_JOB:
            return this.handleExportAllTenants(
              job as Job<ExportAllTenantsJobData>
            );
          default:
            throw new Error(`Unknown job type: ${job.name}`);
        }
      },
      {
        connection: getRedisConnection(),
        concurrency: 2, // Process 2 export jobs concurrently
        removeOnComplete: {
          count: 100, // Keep last 100 completed jobs
          age: 24 * 60 * 60, // Keep for 24 hours
        },
        removeOnFail: {
          count: 100, // Keep last 100 failed jobs
          age: 7 * 24 * 60 * 60, // Keep for 7 days
        },
      }
    );

    // Set up event handlers
    this.setupEventHandlers();
  }

  /**
   * Start the export worker
   */
  async start(): Promise<void> {
    logger.info('Starting export worker');
    // Worker starts automatically when instantiated
  }

  /**
   * Stop the export worker
   */
  async stop(): Promise<void> {
    logger.info('Stopping export worker');
    await this.worker.close();
  }

  /**
   * Set up event handlers for the worker
   */
  private setupEventHandlers(): void {
    this.worker.on('completed', (job) => {
      logger.info(`Export job ${job.id} completed successfully`, {
        jobName: job.name,
        result: job.returnvalue,
      });
    });

    this.worker.on('failed', (job, err) => {
      logger.error(`Export job ${job?.id} failed`, {
        jobName: job?.name,
        error: err.message,
        stack: err.stack,
      });
    });

    this.worker.on('error', (err) => {
      logger.error('Export worker error', err);
    });
  }

  /**
   * Handle export tenant job
   */
  private async handleExportTenant(job: Job<ExportTenantJobData>) {
    const { tenantId } = job.data;

    logger.info(`Starting export for tenant ${tenantId}`, {
      jobId: job.id,
    });

    // Update progress
    await job.updateProgress(0);

    try {
      // Export tenant data
      const result = await this.exportService.exportTenant(tenantId);

      // Update progress
      await job.updateProgress(100);

      return result;
    } catch (error) {
      logger.error(`Failed to export tenant ${tenantId}`, error);
      throw error;
    }
  }

  /**
   * Handle export all tenants job
   */
  private async handleExportAllTenants(job: Job<ExportAllTenantsJobData>) {
    logger.info('Starting export for all tenants', {
      jobId: job.id,
    });

    // Update progress
    await job.updateProgress(0);

    try {
      // Export all tenants
      const results = await this.exportService.exportAllTenants();

      // Update progress
      await job.updateProgress(100);

      return results;
    } catch (error) {
      logger.error('Failed to export all tenants', error);
      throw error;
    }
  }
}

// Start the worker if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  logger.info('Starting export worker...');
  const exportWorker = new ExportWorker();
  await exportWorker.start();

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, closing export worker...');
    await exportWorker.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, closing export worker...');
    await exportWorker.stop();
    process.exit(0);
  });
}
