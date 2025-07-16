/**
 * Test setup file
 * Sets up environment variables for tests
 */

// Set test environment variables before importing any modules
process.env.NODE_ENV = 'test';
process.env.ADMIN_API_KEY = 'test-api-key-12345';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/verta_test';
process.env.DATABASE_POOL_SIZE = '5';
process.env.LOG_LEVEL = 'error'; // Minimize logging during tests
