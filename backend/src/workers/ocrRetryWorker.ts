/**
 * Worker for processing hourly OCR retry trigger jobs
 */

import { Worker, type Job } from 'bullmq';
import { addOcrJob } from '../queues/ocrQueue.js';
import { OcrResultRepositoryImpl } from '../repositories/sync/OcrResultRepository.js';
import { MessageAttachmentRepositoryImpl } from '../repositories/sync/MessageAttachmentRepository.js';
import { MessageRepository } from '../repositories/sync/MessageRepository.js';
import { db } from '../database/index.js';
import logger from '../utils/logger.js';
import { redisConfig } from '../config/redis.js';

/**
 * OCR retry worker implementation
 */
export class OcrRetryWorker {
  private worker: Worker;
  private ocrRepo: OcrResultRepositoryImpl;
  private attachmentRepo: MessageAttachmentRepositoryImpl;
  private messageRepo: MessageRepository;

  constructor() {
    this.ocrRepo = new OcrResultRepositoryImpl(db);
    this.attachmentRepo = new MessageAttachmentRepositoryImpl(db);
    this.messageRepo = new MessageRepository(db);

    // Create the worker to process OCR retry triggers
    this.worker = new Worker(
      'ocr-processing',
      async (job: Job) => {
        // Only process retry trigger jobs, ignore all others
        if (job.name !== 'ocr-retry-trigger') {
          // Don't process this job - another worker will handle it
          throw new Error('Job not for this worker');
        }

        await this.runOcrRetry();
        return { success: true, message: 'OCR retry triggered' };
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
    logger.info('Starting OCR retry worker');
    // Worker starts automatically when instantiated
  }

  /**
   * Stop the worker
   */
  async stop(): Promise<void> {
    logger.info('Stopping OCR retry worker');
    await this.worker.close();
  }

  /**
   * Run the OCR retry for failed OCR results
   */
  private async runOcrRetry(): Promise<void> {
    logger.info('Running OCR retry for failed results');

    try {
      // Find failed OCR results that are ready for retry
      const failedResults = await this.ocrRepo.findFailedResults({
        minAgeMs: 3600000, // 1 hour old
        maxRetryCount: 10, // Max 10 total retries
        limit: 50, // Process up to 50 at a time
      });

      logger.info(`Found ${failedResults.length} failed OCR results to retry`);

      // Queue OCR jobs for each failed result
      const retryPromises = failedResults.map(async (result) => {
        try {
          // Get attachment details
          const attachment = await this.attachmentRepo.findById(
            result.attachment_id
          );
          if (!attachment) {
            logger.warn('Attachment not found for OCR result', {
              ocrResultId: result.id,
              attachmentId: result.attachment_id,
            });
            return;
          }

          // Get message details for tenant ID
          const message = await this.messageRepo.findById(attachment.messageId);
          if (!message) {
            logger.warn('Message not found for attachment', {
              attachmentId: attachment.id,
              messageId: attachment.messageId,
            });
            return;
          }

          // Get tenant ID from channel
          const channel = await db
            .selectFrom('channels')
            .select('tenant_id')
            .where('id', '=', message.channelId)
            .executeTakeFirst();

          if (!channel) {
            logger.warn('Channel not found for message', {
              messageId: message.id,
              channelId: message.channelId,
            });
            return;
          }

          // Queue OCR job with incremented attempt count
          const jobId = await addOcrJob({
            tenantId: channel.tenant_id,
            messageId: message.id,
            attachmentId: attachment.id,
            attachmentUrl: attachment.url,
            attachmentFilename: attachment.filename,
            attempt: (result.retry_count || 0) + 1,
          });

          // Reset the OCR result status to allow reprocessing
          await this.ocrRepo.updateStatus(result.id, 'pending');

          logger.info('Queued OCR retry job', {
            jobId,
            ocrResultId: result.id,
            attachmentId: attachment.id,
            retryCount: result.retry_count,
          });
        } catch (error) {
          logger.error('Failed to queue OCR retry job', {
            ocrResultId: result.id,
            error,
          });
        }
      });

      await Promise.all(retryPromises);

      logger.info('OCR retry jobs queued successfully');
    } catch (error) {
      logger.error('Failed to run OCR retry', { error });
    }
  }

  /**
   * Setup event handlers for the worker
   */
  private setupEventHandlers(): void {
    this.worker.on('completed', (job) => {
      if (job.name === 'ocr-retry-trigger') {
        logger.info('OCR retry trigger completed', {
          jobId: job.id,
        });
      }
    });

    this.worker.on('failed', (job, error) => {
      if (job?.name === 'ocr-retry-trigger') {
        logger.error('OCR retry trigger failed', {
          jobId: job?.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    this.worker.on('error', (error) => {
      logger.error('OCR retry worker error', { error });
    });
  }
}
