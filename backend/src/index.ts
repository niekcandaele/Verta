import { createApp } from './app.js';
import { initializeDatabase, closeDatabase } from './database/connection.js';
import { migrateToLatest } from './database/migrator.js';
import { config } from './config/env.js';
import logger from './utils/logger.js';
import {
  SyncWorker,
  HourlyTriggerWorker,
  ChannelSyncWorker,
  AnalysisWorker,
  OcrWorker,
  KnowledgeBaseWorker,
  BotEventWorker,
} from './workers/index.js';
import { 
  syncScheduler, 
  ocrRetryScheduler,
  startKnowledgeBaseScheduler,
  stopKnowledgeBaseScheduler
} from './scheduler/index.js';
import { discordClientManager } from './adapters/discord/DiscordClientManager.js';
import { discordBotService } from './services/discord/DiscordBotService.js';
import { MlClientService } from './services/MlClientService.js';
import { mlConfig } from './config/ml.js';
import { db } from './database/index.js';

const PORT = config.PORT;

// Global references to workers
let syncWorker: SyncWorker | null = null;
let hourlyTriggerWorker: HourlyTriggerWorker | null = null;
let channelSyncWorker: ChannelSyncWorker | null = null;
let analysisWorker: AnalysisWorker | null = null;
let ocrWorker: OcrWorker | null = null;
let knowledgeBaseWorker: KnowledgeBaseWorker | null = null;
let botEventWorker: BotEventWorker | null = null;
let mlService: MlClientService | null = null;

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

    // Initialize Discord client ONCE for the entire application
    if (config.NODE_ENV !== 'test') {
      logger.info('Initializing global Discord client...');
      await discordClientManager.initialize();
      logger.info('Global Discord client initialized');

      // Initialize Discord bot service
      logger.info('Initializing Discord bot service...');
      await discordBotService.initialize();
      logger.info('Discord bot service initialized');
    }

    // Start workers and scheduler
    if (config.NODE_ENV !== 'test') {
      // Initialize ML service
      logger.info('Initializing ML service client...');
      mlService = new MlClientService({
        baseUrl: mlConfig.mlServiceUrl,
        apiKey: mlConfig.mlServiceApiKey,
        timeout: mlConfig.mlServiceTimeout,
        ocrTimeout: mlConfig.mlServiceOcrTimeout,
        maxRetries: mlConfig.mlServiceMaxRetries,
        retryDelay: mlConfig.mlServiceRetryDelay,
      });
      logger.info('ML service client initialized');

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

      // Start channel sync worker
      logger.info('Starting channel sync worker...');
      channelSyncWorker = new ChannelSyncWorker();
      await channelSyncWorker.start();
      logger.info('Channel sync worker started');

      // Start analysis worker
      logger.info('Starting analysis worker...');
      analysisWorker = new AnalysisWorker();
      await analysisWorker.start();
      logger.info('Analysis worker started');

      // Start OCR worker (handles both OCR processing and retry triggers)
      logger.info('Starting OCR worker...');
      ocrWorker = new OcrWorker(mlService, db);
      await ocrWorker.start();
      logger.info('OCR worker started');

      // Start knowledge base worker
      logger.info('Starting knowledge base worker...');
      knowledgeBaseWorker = new KnowledgeBaseWorker(db);
      await knowledgeBaseWorker.start();
      logger.info('Knowledge base worker started');

      // Start bot event worker
      logger.info('Starting bot event worker...');
      botEventWorker = new BotEventWorker();
      await botEventWorker.start();
      logger.info('Bot event worker started');

      // Start sync scheduler
      logger.info('Starting sync scheduler...');
      await syncScheduler.start();
      logger.info('Sync scheduler started');

      // Start OCR retry scheduler
      logger.info('Starting OCR retry scheduler...');
      await ocrRetryScheduler.start();
      logger.info('OCR retry scheduler started');

      // Start knowledge base scheduler
      logger.info('Starting knowledge base scheduler...');
      await startKnowledgeBaseScheduler();
      logger.info('Knowledge base scheduler started');
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

          // Stop OCR retry scheduler
          logger.info('Stopping OCR retry scheduler...');
          await ocrRetryScheduler.stop();
          logger.info('OCR retry scheduler stopped');

          // Stop knowledge base scheduler
          logger.info('Stopping knowledge base scheduler...');
          await stopKnowledgeBaseScheduler();
          logger.info('Knowledge base scheduler stopped');

          // Stop hourly trigger worker
          if (hourlyTriggerWorker) {
            logger.info('Stopping hourly trigger worker...');
            await hourlyTriggerWorker.stop();
            logger.info('Hourly trigger worker stopped');
          }

          // Stop sync worker
          if (syncWorker) {
            logger.info('Stopping sync worker...');
            await syncWorker.stop();
            logger.info('Sync worker stopped');
          }

          // Stop channel sync worker
          if (channelSyncWorker) {
            logger.info('Stopping channel sync worker...');
            await channelSyncWorker.stop();
            logger.info('Channel sync worker stopped');
          }

          // Stop analysis worker
          if (analysisWorker) {
            logger.info('Stopping analysis worker...');
            await analysisWorker.stop();
            logger.info('Analysis worker stopped');
          }

          // Stop OCR worker
          if (ocrWorker) {
            logger.info('Stopping OCR worker...');
            await ocrWorker.stop();
            logger.info('OCR worker stopped');
          }

          // Stop knowledge base worker
          if (knowledgeBaseWorker) {
            logger.info('Stopping knowledge base worker...');
            await knowledgeBaseWorker.stop();
            logger.info('Knowledge base worker stopped');
          }

          // Stop bot event worker
          if (botEventWorker) {
            logger.info('Stopping bot event worker...');
            await botEventWorker.stop();
            logger.info('Bot event worker stopped');
          }

          // Cleanup Discord bot service
          logger.info('Cleaning up Discord bot service...');
          await discordBotService.cleanup();
          logger.info('Discord bot service cleaned up');

          // Cleanup Discord client
          logger.info('Cleaning up Discord client...');
          await discordClientManager.cleanup();
          logger.info('Discord client cleaned up');

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
