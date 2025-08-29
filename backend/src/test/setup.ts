/**
 * Test setup file
 * Sets up environment variables for tests
 */

// Set test environment variables before importing any modules
process.env.NODE_ENV = 'test';
process.env.ADMIN_API_KEY = 'test-api-key-12345';
process.env.DATABASE_URL = 'mysql://root:@localhost:4000/test';
process.env.DATABASE_POOL_SIZE = '5';
process.env.LOG_LEVEL = 'error'; // Minimize logging during tests
process.env.DISCORD_BOT_TOKEN = 'test-discord-bot-token';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '25002';
