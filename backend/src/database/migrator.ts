import { Migrator, FileMigrationProvider } from 'kysely';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { db } from './index.js';
import logger from '../utils/logger.js';

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
      logger.info('Migration executed successfully', {
        migration: it.migrationName,
      });
    } else if (it.status === 'Error') {
      logger.error('Failed to execute migration', {
        migration: it.migrationName,
      });
    }
  });

  if (error) {
    logger.error('Failed to migrate', { error });
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
      logger.info('Migration rolled back successfully', {
        migration: it.migrationName,
      });
    } else if (it.status === 'Error') {
      logger.error('Failed to rollback migration', {
        migration: it.migrationName,
      });
    }
  });

  if (error) {
    logger.error('Failed to rollback migration', { error });
    throw error;
  }
}

/**
 * Get list of executed and pending migrations
 */
export async function getMigrationStatus() {
  try {
    const migrations = await migrator.getMigrations();

    logger.info('Migration Status');

    for (const migration of migrations) {
      const status = migration.executedAt ? 'Executed' : 'Pending';
      logger.info('Migration', {
        name: migration.name,
        status,
        executedAt: migration.executedAt?.toISOString() || null,
      });
    }

    return migrations;
  } catch (error) {
    logger.error('Failed to get migration status', { error });
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
      logger.info('Migration executed successfully', {
        migration: it.migrationName,
      });
    } else if (it.status === 'Error') {
      logger.error('Failed to execute migration', {
        migration: it.migrationName,
      });
    }
  });

  if (error) {
    logger.error('Failed to migrate up', { error });
    throw error;
  }
}
