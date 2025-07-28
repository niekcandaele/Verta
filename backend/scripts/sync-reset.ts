#!/usr/bin/env tsx

import { db } from '../src/database/index.js';
import readline from 'readline';

// Parse command line arguments
const args = process.argv.slice(2);
const tenantArg = args.find((arg) => arg.startsWith('--tenant='));
const tenantId = tenantArg ? tenantArg.split('=')[1] : null;

// Color codes for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Prompt for user confirmation
 */
async function confirmAction(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (yes/no): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

/**
 * Get tenant information
 */
async function getTenant(tenantId: string) {
  const tenant = await db
    .selectFrom('tenants')
    .selectAll()
    .where('id', '=', tenantId)
    .executeTakeFirst();

  return tenant;
}

/**
 * Reset sync progress for a tenant
 */
async function resetSyncProgress(tenantId: string) {
  try {
    // Delete from sync_progress
    const syncProgressResult = await db
      .deleteFrom('sync_progress')
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();

    const syncProgressDeleted = Number(syncProgressResult.numDeletedRows);
    log(
      `   ✅ Deleted ${syncProgressDeleted} sync progress records`,
      syncProgressDeleted > 0 ? 'green' : 'yellow'
    );

    // Delete from channel_sync_jobs
    const channelJobsResult = await (db as any)
      .deleteFrom('channel_sync_jobs')
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();

    const channelJobsDeleted = Number(channelJobsResult.numDeletedRows);
    log(
      `   ✅ Deleted ${channelJobsDeleted} channel sync job records`,
      channelJobsDeleted > 0 ? 'green' : 'yellow'
    );

    return {
      syncProgressDeleted,
      channelJobsDeleted,
    };
  } catch (error: any) {
    throw new Error(`Failed to reset sync progress: ${error.message}`);
  }
}

/**
 * Main function
 */
async function main() {
  try {
    log('\n🔄 Sync Reset Tool', 'bright');
    log('==================', 'bright');

    if (!tenantId) {
      log('\n❌ Error: --tenant parameter is required', 'red');
      log('Usage: npm run sync:reset -- --tenant=<tenant-id>', 'yellow');
      process.exit(1);
    }

    // Get tenant information
    const tenant = await getTenant(tenantId);

    if (!tenant) {
      log(`\n❌ Tenant not found: ${tenantId}`, 'red');
      process.exit(1);
    }

    log(`\n📋 Tenant Information:`, 'blue');
    log(`   Name: ${tenant.name}`, 'cyan');
    log(`   ID: ${tenant.id}`, 'cyan');
    log(`   Platform: ${tenant.platform}`, 'cyan');
    log(`   Status: ${tenant.status}`, 'cyan');

    // Confirm action
    log(
      '\n⚠️  Warning: This will reset all sync progress for this tenant!',
      'yellow'
    );
    log('   - All channel sync progress will be deleted', 'yellow');
    log('   - All channel sync job records will be deleted', 'yellow');
    log('   - The next sync will be a full sync from the beginning', 'yellow');

    const confirmed = await confirmAction('\nDo you want to continue?');

    if (!confirmed) {
      log('\n❌ Operation cancelled', 'red');
      process.exit(0);
    }

    log('\n🗑️  Resetting sync progress...', 'yellow');

    const result = await resetSyncProgress(tenantId);

    log('\n✅ Sync progress reset successfully!', 'green');
    log('\n📊 Summary:', 'bright');
    log(
      `   - Sync progress records deleted: ${result.syncProgressDeleted}`,
      'cyan'
    );
    log(
      `   - Channel sync job records deleted: ${result.channelJobsDeleted}`,
      'cyan'
    );

    log('\n🎉 Reset completed!', 'cyan');
    log(
      '   The next sync for this tenant will start from the beginning.',
      'yellow'
    );
  } catch (error: any) {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

// Run the reset
main().catch((error) => {
  log(`\n❌ Unhandled error: ${error.message}`, 'red');
  process.exit(1);
});
