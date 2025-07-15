import { createApp } from './app.js';
import { initializeDatabase, closeDatabase } from './database/connection.js';
import { migrateToLatest } from './database/migrator.js';
import { config } from './config/env.js';

const PORT = config.PORT;

/**
 * Start the application
 */
async function startServer() {
  try {
    // Initialize database connection
    console.log('Initializing database connection...');
    await initializeDatabase();

    // Run database migrations in development and production
    if (config.NODE_ENV !== 'test') {
      console.log('Running database migrations...');
      await migrateToLatest();
      console.log('Database migrations completed');
    }

    // Create and start Express app
    const app = createApp();

    const server = app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Environment: ${config.NODE_ENV}`);
    });

    // Graceful shutdown handling
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n${signal} received. Starting graceful shutdown...`);

      // Stop accepting new connections
      server.close(async () => {
        console.log('HTTP server closed');

        try {
          // Close database connections
          await closeDatabase();
          console.log('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          console.error('Error during shutdown:', error);
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      global.setTimeout(() => {
        console.error('Graceful shutdown timeout - forcing exit');
        process.exit(1);
      }, 30000);
    };

    // Register shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();
