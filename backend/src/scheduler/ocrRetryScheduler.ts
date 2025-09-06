/**
 * OCR retry scheduler for automatic hourly retry of failed OCR jobs
 */

import { getOcrQueue } from '../queues/ocrQueue.js';
import logger from '../utils/logger.js';

/**
 * Schedule hourly OCR retry jobs for failed OCR results
 */
export class OcrRetryScheduler {
  private isRunning = false;

  constructor() {
    // No initialization needed
  }

  /**
   * Start the scheduler
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('OCR retry scheduler is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting OCR retry scheduler');

    // Schedule the hourly OCR retry job
    await this.scheduleHourlyRetry();

    logger.info('OCR retry scheduler started successfully');
  }

  /**
   * Stop the scheduler
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    logger.info('Stopping OCR retry scheduler');

    const queue = getOcrQueue();

    // Remove the repeatable job
    await queue.removeRepeatable('ocr-retry-trigger', {
      pattern: '0 * * * *',
    });

    logger.info('OCR retry scheduler stopped');
  }

  /**
   * Schedule the hourly OCR retry job
   */
  private async scheduleHourlyRetry(): Promise<void> {
    const queue = getOcrQueue();

    // Add a repeatable job that runs every hour
    // Note: We use a dummy data object that satisfies OcrJobData type
    // but the actual retry logic will fetch failed results from DB
    await queue.add(
      'ocr-retry-trigger',
      {
        tenantId: 'scheduler',
        messageId: 'scheduler',
        attachmentId: 'scheduler',
        attachmentUrl: 'scheduler',
        attachmentFilename: 'scheduler',
      } as any, // This is just a trigger, data is not used
      {
        repeat: {
          pattern: '0 * * * *', // Every hour at minute 0
        },
        removeOnComplete: true,
        removeOnFail: false,
      }
    );

    logger.info('Hourly OCR retry job scheduled');
  }
}

// Export singleton instance
export const ocrRetryScheduler = new OcrRetryScheduler();
