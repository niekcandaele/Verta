import { Migrator, FileMigrationProvider } from 'kysely';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { db } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create migrator instance
export const migrator = new Migrator({
  db,
  provider: new FileMigrationProvider({
    fs,
    path,
    migrationFolder: path.join(__dirname, 'migrations'),
  }),
});

/**
 * Run all pending migrations
 */
export async function migrateToLatest() {
  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((it) => {
    if (it.status === 'Success') {
      console.log(`migration "${it.migrationName}" was executed successfully`);
    } else if (it.status === 'Error') {
      console.error(`failed to execute migration "${it.migrationName}"`);
    }
  });

  if (error) {
    console.error('failed to migrate');
    console.error(error);
    throw error;
  }
}

/**
 * Rollback the last migration
 */
export async function migrateDown() {
  const { error, results } = await migrator.migrateDown();

  results?.forEach((it) => {
    if (it.status === 'Success') {
      console.log(
        `migration "${it.migrationName}" was rolled back successfully`
      );
    } else if (it.status === 'Error') {
      console.error(`failed to rollback migration "${it.migrationName}"`);
    }
  });

  if (error) {
    console.error('failed to rollback migration');
    console.error(error);
    throw error;
  }
}

/**
 * Get list of executed and pending migrations
 */
export async function getMigrationStatus() {
  try {
    const migrations = await migrator.getMigrations();

    console.log('Migration Status:');
    console.log('=================');

    for (const migration of migrations) {
      const status = migration.executedAt ? 'Executed' : 'Pending';
      const executedAt = migration.executedAt
        ? ` at ${migration.executedAt.toISOString()}`
        : '';
      console.log(`${migration.name}: ${status}${executedAt}`);
    }

    return migrations;
  } catch (error) {
    console.error('Failed to get migration status:', error);
    throw error;
  }
}

/**
 * Run a specific number of migrations up
 * @param count Number of migrations to run
 */
export async function migrateUp(_count: number = 1) {
  const { error, results } = await migrator.migrateUp();

  results?.forEach((it) => {
    if (it.status === 'Success') {
      console.log(`migration "${it.migrationName}" was executed successfully`);
    } else if (it.status === 'Error') {
      console.error(`failed to execute migration "${it.migrationName}"`);
    }
  });

  if (error) {
    console.error('failed to migrate up');
    console.error(error);
    throw error;
  }
}
