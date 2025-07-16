import { createApp } from './app.js';
import { initializeDatabase, closeDatabase } from './database/connection.js';
import { migrateToLatest } from './database/migrator.js';
import { config } from './config/env.js';
import logger from './utils/logger.js';

const PORT = config.PORT;

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
