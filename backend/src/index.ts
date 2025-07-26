import { createApp } from './app.js';
import { initializeDatabase, closeDatabase } from './database/connection.js';
import { migrateToLatest } from './database/migrator.js';
import { config } from './config/env.js';
import logger from './utils/logger.js';
import {
  SyncWorker,
  HourlyTriggerWorker,
  ExportWorker,
} from './workers/index.js';
import { syncScheduler } from './scheduler/index.js';

const PORT = config.PORT;

// Global references to workers
let syncWorker: SyncWorker | null = null;
let hourlyTriggerWorker: HourlyTriggerWorker | null = null;
let exportWorker: ExportWorker | null = null;

/**
 * Start the application
 */
async function startServer() {
  try {
    // Initialize database connection
    logger.info('Initializing database connection...');
    await initializeDatabase();

    // Run database migrations in development and production
    if (config.NODE_ENV !== 'test') {
      logger.info('Running database migrations...');
      await migrateToLatest();
      logger.info('Database migrations completed');
    }

    // Start workers and scheduler
    if (config.NODE_ENV !== 'test') {
      // Start sync worker
      logger.info('Starting sync worker...');
      syncWorker = new SyncWorker();
      await syncWorker.start();
      logger.info('Sync worker started');

      // Start hourly trigger worker
      logger.info('Starting hourly trigger worker...');
      hourlyTriggerWorker = new HourlyTriggerWorker();
      await hourlyTriggerWorker.start();
      logger.info('Hourly trigger worker started');

      // Start export worker
      logger.info('Starting export worker...');
      exportWorker = new ExportWorker();
      await exportWorker.start();
      logger.info('Export worker started');

      // Start sync scheduler
      logger.info('Starting sync scheduler...');
      await syncScheduler.start();
      logger.info('Sync scheduler started');
    }

    // Create and start Express app
    const app = createApp();

    const server = app.listen(PORT, () => {
      logger.info('Server started', {
        port: PORT,
        environment: config.NODE_ENV,
      });
    });

    // Graceful shutdown handling
    const gracefulShutdown = async (signal: string) => {
      logger.info('Signal received, starting graceful shutdown', { signal });

      // Stop accepting new connections
      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          // Stop sync scheduler
          logger.info('Stopping sync scheduler...');
          await syncScheduler.stop();
          logger.info('Sync scheduler stopped');

          // Stop hourly trigger worker
          if (hourlyTriggerWorker) {
            logger.info('Stopping hourly trigger worker...');
            await hourlyTriggerWorker.stop();
            logger.info('Hourly trigger worker stopped');
          }

          // Stop export worker
          if (exportWorker) {
            logger.info('Stopping export worker...');
            await exportWorker.stop();
            logger.info('Export worker stopped');
          }

          // Stop sync worker
          if (syncWorker) {
            logger.info('Stopping sync worker...');
            await syncWorker.stop();
            logger.info('Sync worker stopped');
          }

          // Close database connections
          await closeDatabase();
          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown', { error });
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      global.setTimeout(() => {
        logger.error('Graceful shutdown timeout - forcing exit');
        process.exit(1);
      }, 30000);
    };

    // Register shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// Start the server
startServer();
