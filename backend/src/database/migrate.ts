#!/usr/bin/env node
import {
  migrateToLatest,
  migrateDown,
  getMigrationStatus,
} from './migrator.js';
import { closeDatabase } from './connection.js';

async function main() {
  const command = process.argv[2];

  try {
    switch (command) {
      case 'up':
        console.log('Running pending migrations...');
        await migrateToLatest();
        console.log('Migrations completed successfully');
        break;

      case 'down':
        console.log('Rolling back last migration...');
        await migrateDown();
        console.log('Rollback completed successfully');
        break;

      case 'status':
        await getMigrationStatus();
        break;

      case 'latest':
        console.log('Running all pending migrations...');
        await migrateToLatest();
        console.log('All migrations completed successfully');
        break;

      default:
        console.error('Unknown command:', command);
        console.log('Available commands:');
        console.log('  up      - Run all pending migrations');
        console.log('  down    - Rollback the last migration');
        console.log('  status  - Show migration status');
        console.log('  latest  - Run all pending migrations (alias for up)');
        process.exit(1);
    }
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

main();
