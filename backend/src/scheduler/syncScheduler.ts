/**
 * Sync scheduler for automatic hourly tenant syncs
 */

import { syncQueue } from '../queues/syncQueue.js';
import logger from '../utils/logger.js';

/**
 * Schedule hourly syncs for all active Discord tenants
 */
export class SyncScheduler {
  private isRunning = false;

  constructor() {
    // No initialization needed
  }

  /**
   * Start the scheduler
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Sync scheduler is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting sync scheduler');

    // Schedule the hourly sync job
    await this.scheduleHourlySync();

    logger.info('Sync scheduler started successfully');
  }

  /**
   * Stop the scheduler
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    logger.info('Stopping sync scheduler');

    // Remove the repeatable job
    await syncQueue.removeRepeatable('hourly-sync-trigger', {
      pattern: '0 * * * *',
    });

    logger.info('Sync scheduler stopped');
  }

  /**
   * Schedule the hourly sync job
   */
  private async scheduleHourlySync(): Promise<void> {
    // Add a repeatable job that runs every hour
    await syncQueue.add(
      'hourly-sync-trigger',
      {},
      {
        repeat: {
          pattern: '0 * * * *', // Every hour at minute 0
        },
        removeOnComplete: true,
        removeOnFail: false,
      }
    );

    logger.info('Hourly sync job scheduled');
  }
}

// Export singleton instance
export const syncScheduler = new SyncScheduler();
