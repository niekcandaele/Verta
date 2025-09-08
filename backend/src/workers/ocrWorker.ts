import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { redisConfig } from '../config/redis.js';
import { OcrJobData, OcrJobResult, addOcrJob } from '../queues/ocrQueue.js';
import { MlClientService } from '../services/MlClientService.js';
import { OcrResultRepositoryImpl } from '../repositories/sync/OcrResultRepository.js';
import { MessageAttachmentRepositoryImpl } from '../repositories/sync/MessageAttachmentRepository.js';
import { MessageRepository } from '../repositories/sync/MessageRepository.js';
import type { Kysely } from 'kysely';
import type { Database } from '../database/types.js';
import logger from '../utils/logger.js';

/**
 * OCR Worker for processing image attachments
 */
export class OcrWorker {
  private worker: Worker<OcrJobData, OcrJobResult> | null = null;
  private mlService: MlClientService;
  private ocrRepository: OcrResultRepositoryImpl;
  private attachmentRepo: MessageAttachmentRepositoryImpl;
  private messageRepo: MessageRepository;
  private db: Kysely<Database>;

  constructor(mlService: MlClientService, db: Kysely<Database>) {
    this.mlService = mlService;
    this.db = db;
    this.ocrRepository = new OcrResultRepositoryImpl(db);
    this.attachmentRepo = new MessageAttachmentRepositoryImpl(db);
    this.messageRepo = new MessageRepository(db);
  }

  /**
   * Start the OCR worker
   */
  async start(): Promise<void> {
    if (this.worker) {
      logger.warn('OCR worker already started');
      return;
    }

    const redis = new Redis(redisConfig);

    this.worker = new Worker<OcrJobData, OcrJobResult>(
      'ocr-processing',
      async (job: Job<OcrJobData>) => {
        // Handle different job types
        switch (job.name) {
          case 'ocr-retry-trigger':
            logger.info('Processing OCR retry trigger', { jobId: job.id });
            await this.runOcrRetry();
            return { success: true, message: 'OCR retry completed' };

          default:
            // Regular OCR processing job
            return this.processOcrJob(job);
        }
      },
      {
        connection: redis,
        concurrency: 2, // Reduced from 5 to 2 for CPU-based OCR
        maxStalledCount: 3,
        stalledInterval: 300000, // Increased to 5 minutes for CPU-based OCR
      }
    );

    // Set up event handlers
    this.worker.on('completed', (job) => {
      logger.info('OCR job completed', {
        jobId: job.id,
        messageId: job.data.messageId,
        attachmentId: job.data.attachmentId,
      });
    });

    this.worker.on('failed', (job, err) => {
      logger.error('OCR job failed', {
        jobId: job?.id,
        messageId: job?.data.messageId,
        attachmentId: job?.data.attachmentId,
        error: err.message,
        attempts: job?.attemptsMade,
      });
    });

    this.worker.on('stalled', (jobId) => {
      logger.warn('OCR job stalled', { jobId });
    });

    logger.info('OCR worker started');
  }

  /**
   * Check if a Discord CDN URL has expired
   */
  private isDiscordUrlExpired(url: string): boolean {
    try {
      // Parse Discord CDN URLs that have expiration parameters
      const urlObj = new URL(url);
      if (!urlObj.hostname.includes('cdn.discordapp.com')) {
        return false; // Not a Discord URL, can't check expiration
      }

      // Get the 'ex' parameter which contains the expiration timestamp
      const exParam = urlObj.searchParams.get('ex');
      if (!exParam) {
        return false; // No expiration parameter, assume it's valid
      }

      // Discord 'ex' parameter is a hex timestamp in seconds
      const expirationTimestamp = parseInt(exParam, 16) * 1000; // Convert to milliseconds
      const now = Date.now();

      return now > expirationTimestamp;
    } catch (error) {
      logger.error('Error checking Discord URL expiration', { url, error });
      return false; // On error, assume URL is valid and let OCR fail naturally
    }
  }

  /**
   * Process a single OCR job
   */
  private async processOcrJob(job: Job<OcrJobData>): Promise<OcrJobResult> {
    const startTime = Date.now();
    const {
      tenantId,
      messageId,
      attachmentId,
      attachmentUrl,
      attachmentFilename,
      attempt = 1,
    } = job.data;

    logger.info('Processing OCR job', {
      jobId: job.id,
      tenantId,
      messageId,
      attachmentId,
      filename: attachmentFilename,
      attempt,
    });

    try {
      // Check if URL has expired before attempting OCR
      if (this.isDiscordUrlExpired(attachmentUrl)) {
        const errorMessage = 'Discord attachment URL has expired';
        logger.warn('Skipping OCR for expired URL', {
          attachmentId,
          url: attachmentUrl,
        });

        // Store as permanently failed
        await this.ocrRepository.create({
          attachment_id: attachmentId,
          model_version: 'skipped',
          extracted_text: null,
          confidence: null,
          status: 'failed',
          error_message: errorMessage,
          retry_count: attempt - 1,
          processing_time_ms: Date.now() - startTime,
        });

        // Return failure but don't throw to prevent retry
        return {
          success: false,
          error: errorMessage,
        };
      }
      // Update job progress
      await job.updateProgress(10);

      // Check if we already have OCR results for this attachment
      const existingResult =
        await this.ocrRepository.findLatestByAttachment(attachmentId);

      if (existingResult && !this.shouldReprocess(existingResult)) {
        logger.info('OCR result already exists, skipping', {
          attachmentId,
          status: existingResult.status,
        });
        return {
          success: true,
          text: existingResult.extracted_text || '',
          full_response: existingResult.extracted_text || '', // Same as text for existing results
          confidence: existingResult.confidence || 0,
          processingTimeMs: existingResult.processing_time_ms || 0,
          model_name: existingResult.model_version || 'unknown',
        };
      }

      // Update progress
      await job.updateProgress(30);

      // Call ML service to perform OCR
      const ocrResult = await this.mlService.ocr({
        image_url: attachmentUrl,
      });

      // Update progress
      await job.updateProgress(80);

      // Store OCR results in database with full response
      await this.ocrRepository.create({
        attachment_id: attachmentId,
        model_version:
          ocrResult.model_name || ocrResult.model_used || 'openrouter',
        extracted_text: ocrResult.full_response || ocrResult.text, // Store full response with visual context
        confidence: ocrResult.confidence,
        status: 'completed',
        error_message: null,
        retry_count: attempt - 1,
        processing_time_ms: ocrResult.processing_time_ms,
      });

      // Update progress
      await job.updateProgress(100);

      const processingTime = Date.now() - startTime;
      logger.info('OCR job completed successfully', {
        jobId: job.id,
        attachmentId,
        textLength: ocrResult.text.length,
        confidence: ocrResult.confidence,
        processingTimeMs: processingTime,
      });

      return {
        success: true,
        text: ocrResult.full_response || ocrResult.text, // Use full_response for backward compat
        full_response: ocrResult.full_response,
        visual_context: ocrResult.visual_context,
        confidence: ocrResult.confidence,
        processingTimeMs: processingTime,
        model_used: ocrResult.model_used,
        model_name: ocrResult.model_name,
        attempts: ocrResult.attempts,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Check if this is a permanent failure
      const isPermanentFailure = this.isPermanentFailure(error);

      logger.error('OCR processing failed', {
        jobId: job.id,
        attachmentId,
        error: errorMessage,
        attempt,
        processingTimeMs: processingTime,
        isPermanentFailure,
      });

      // Store failure in database
      if (!(await this.ocrRepository.findLatestByAttachment(attachmentId))) {
        await this.ocrRepository.create({
          attachment_id: attachmentId,
          model_version: 'openrouter',
          extracted_text: null,
          confidence: null,
          status: 'failed',
          error_message: errorMessage,
          retry_count: attempt - 1,
          processing_time_ms: processingTime,
        });
      } else {
        // Update existing result as failed
        const existing =
          await this.ocrRepository.findLatestByAttachment(attachmentId);
        if (existing) {
          await this.ocrRepository.markFailed(
            existing.id,
            errorMessage,
            attempt - 1
          );
        }
      }

      // If permanent failure or last attempt, return failure without retrying
      if (isPermanentFailure || attempt >= 3) {
        return {
          success: false,
          error: errorMessage,
        };
      }

      // Otherwise, throw to trigger retry
      throw error;
    }
  }

  /**
   * Check if an error represents a permanent failure that shouldn't be retried
   */
  private isPermanentFailure(error: unknown): boolean {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check for permanent failure indicators
    const permanentFailurePatterns = [
      'Could not load image from URL', // URL is invalid or inaccessible
      'Request failed with status code 403', // Forbidden
      'Request failed with status code 404', // Not found
      'Discord attachment URL has expired', // Expired Discord URL
    ];

    return permanentFailurePatterns.some((pattern) =>
      errorMessage.includes(pattern)
    );
  }

  /**
   * Check if OCR result should be reprocessed
   */
  private shouldReprocess(existingResult: any): boolean {
    // Don't reprocess if:
    // 1. Result is successful and less than 7 days old
    // 2. Result has failed 3 times already

    if (existingResult.status === 'completed') {
      const age = Date.now() - new Date(existingResult.created_at).getTime();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      return age > sevenDaysMs;
    }

    return existingResult.retry_count < 3; // Retry failed results up to 3 times
  }

  /**
   * Stop the OCR worker
   */
  async stop(): Promise<void> {
    if (!this.worker) {
      logger.warn('OCR worker not running');
      return;
    }

    await this.worker.close();
    this.worker = null;
    logger.info('OCR worker stopped');
  }

  /**
   * Get worker status
   */
  isRunning(): boolean {
    return this.worker !== null;
  }

  /**
   * Queue OCR jobs for image attachments that don't have OCR results yet
   */
  private async queueMissingOcrJobs(): Promise<number> {
    logger.info('Finding image attachments without OCR results');

    try {
      // Define supported image types (same as ChannelSyncWorker)
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

      // Find image attachments without OCR results
      const missingOcrAttachments = await this.db
        .selectFrom('message_attachments as ma')
        .innerJoin('messages as m', 'm.id', 'ma.message_id')
        .innerJoin('channels as c', 'c.id', 'm.channel_id')
        .leftJoin('ocr_results as ocr', 'ocr.attachment_id', 'ma.id')
        .select([
          'ma.id as attachment_id',
          'ma.message_id',
          'ma.url',
          'ma.filename',
          'ma.content_type',
          'c.tenant_id',
        ])
        .where('ocr.id', 'is', null)
        .where((eb) => {
          const conditions = imageTypes.map((type) =>
            eb('ma.content_type', '=', type)
          );
          return eb.or(conditions);
        })
        .limit(2000) // Process up to 2000 at a time
        .execute();

      if (missingOcrAttachments.length === 0) {
        logger.info('No missing OCR jobs found');
        return 0;
      }

      logger.info(
        `Found ${missingOcrAttachments.length} image attachments without OCR results`
      );

      // Queue OCR jobs for each missing attachment
      const queuePromises = missingOcrAttachments.map(async (attachment) => {
        try {
          const jobId = await addOcrJob({
            tenantId: attachment.tenant_id,
            messageId: attachment.message_id,
            attachmentId: attachment.attachment_id,
            attachmentUrl: attachment.url,
            attachmentFilename: attachment.filename,
            attempt: 1,
          });

          logger.debug('Queued OCR job for missing attachment', {
            jobId,
            attachmentId: attachment.attachment_id,
            filename: attachment.filename,
          });

          return jobId;
        } catch (error) {
          logger.error('Failed to queue OCR job for attachment', {
            attachmentId: attachment.attachment_id,
            error,
          });
          return null;
        }
      });

      const results = await Promise.all(queuePromises);
      const successCount = results.filter((r) => r !== null).length;

      logger.info(
        `Successfully queued ${successCount} OCR jobs for missing attachments`
      );
      return successCount;
    } catch (error) {
      logger.error('Failed to queue missing OCR jobs', { error });
      return 0;
    }
  }

  /**
   * Run the OCR retry for failed OCR results
   */
  private async runOcrRetry(): Promise<void> {
    logger.info('Running OCR retry for failed results');

    try {
      // First, queue OCR jobs for images that don't have OCR results yet
      const missingCount = await this.queueMissingOcrJobs();
      if (missingCount > 0) {
        logger.info(
          `Queued ${missingCount} OCR jobs for images without results`
        );
      }

      // First, clean up very old failed results that shouldn't be retried
      const cleanupResult = await this.db
        .deleteFrom('ocr_results')
        .where('status', '=', 'failed')
        .where(
          'created_at',
          '<',
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        ) // 30 days old
        .executeTakeFirst();

      if (cleanupResult.numDeletedRows > 0) {
        logger.info(
          `Cleaned up ${cleanupResult.numDeletedRows} old failed OCR results`
        );
      }

      // Find failed OCR results that are ready for retry
      const failedResults = await this.ocrRepository.findFailedResults({
        minAgeMs: 3600000, // 1 hour old
        maxRetryCount: 3, // Reduced from 10 to 3 max retries
        limit: 100, // Process up to 100 at a time (reduced from 5000)
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
          const channel = await this.db
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
          await this.ocrRepository.updateStatus(result.id, 'pending');

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
}
