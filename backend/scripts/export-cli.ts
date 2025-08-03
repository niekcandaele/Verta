#!/usr/bin/env tsx
/**
 * CLI script for triggering data exports
 */

import axios from 'axios';
import { rm, mkdir } from 'fs/promises';
import { resolve } from 'path';
import { execSync } from 'child_process';
import { config } from '../src/config/env.js';

const API_BASE_URL =
  process.env.API_BASE_URL || `http://localhost:${config.PORT}`;

async function exportAllTenants() {
  try {
    console.log('🚀 Triggering export for all tenants...');
    const response = await axios.post(`${API_BASE_URL}/api/export/all-tenants`);
    console.log('✅ Export job queued:', response.data);
    return response.data.jobIds[0];
  } catch (error) {
    console.error('❌ Failed to trigger export:', error);
    process.exit(1);
  }
}

async function exportTenant(tenantId: string) {
  try {
    console.log(`🚀 Triggering export for tenant ${tenantId}...`);
    const response = await axios.post(
      `${API_BASE_URL}/api/export/tenant/${tenantId}`
    );
    console.log('✅ Export job queued:', response.data);
    return response.data.jobId;
  } catch (error) {
    console.error('❌ Failed to trigger export:', error);
    process.exit(1);
  }
}

async function checkStatus(jobId: string) {
  try {
    const response = await axios.get(
      `${API_BASE_URL}/api/export/status/${jobId}`
    );
    const status = response.data;

    console.log(`📊 Job Status: ${status.status}`);
    if (status.progress !== undefined) {
      console.log(`   Progress: ${status.progress}%`);
    }
    if (status.executionTimeMs !== undefined) {
      console.log(`   Execution Time: ${status.executionTimeMs}ms`);
    }
    if (status.error) {
      console.log(`   Error: ${status.error}`);
    }
    if (status.result) {
      console.log(`   Result:`, status.result);
    }

    return status;
  } catch (error) {
    console.error('❌ Failed to check status:', error);
    process.exit(1);
  }
}

async function waitForCompletion(jobId: string, checkInterval = 2000) {
  console.log(`⏳ Waiting for job ${jobId} to complete...`);

  while (true) {
    const status = await checkStatus(jobId);

    if (status.status === 'completed') {
      console.log('✅ Export completed successfully!');
      return status;
    }

    if (status.status === 'failed') {
      console.error('❌ Export failed!');
      process.exit(1);
    }

    await new Promise((resolve) => global.setTimeout(resolve, checkInterval));
  }
}

async function cleanDataDirectory() {
  try {
    // Resolve path to root _data directory
    const dataPath = resolve(process.cwd(), '..', '_data');

    console.log('🧹 Cleaning _data directory...');

    try {
      // Remove existing _data directory
      await rm(dataPath, { recursive: true, force: true });
      console.log('✅ _data directory removed');
    } catch (error: any) {
      if (error.code === 'EACCES') {
        console.warn('⚠️  Permission denied when removing _data directory');
        console.warn(
          '   The directory may have been created by Docker running as root'
        );
        console.warn(
          '   You may need to manually remove it with: sudo rm -rf _data'
        );
        console.warn('   Continuing without cleanup...');
        return; // Continue without throwing
      }
      throw error; // Re-throw other errors
    }

    // Recreate empty _data directory with open permissions
    await mkdir(dataPath, { recursive: true, mode: 0o777 });

    console.log('✅ _data directory cleaned and recreated');
  } catch (error) {
    console.error('❌ Failed to clean _data directory:', error);
    throw error;
  }
}

async function syncExportData() {
  // Only sync if we're not running inside Docker
  if (process.env.DOCKERIZED === 'true') {
    return;
  }

  console.log('\n📦 Syncing exported data from Docker container to host...');

  try {
    // Remove old data-export directory to ensure clean sync
    execSync('rm -rf ../_data/data-export', {
      cwd: process.cwd(),
      stdio: 'pipe',
    });

    // Copy from container
    execSync('docker cp verta-app:/data/data-export ../_data/', {
      cwd: process.cwd(),
      stdio: 'inherit',
    });

    console.log('✅ Data synced successfully!');
  } catch (error: any) {
    console.error('❌ Failed to sync data from container:', error.message);
    // Don't throw - this is a non-critical error
  }
}

// Main CLI logic
async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];
  const waitFlag = process.argv.includes('--wait');

  switch (command) {
    case 'all': {
      // Clean _data directory before export
      await cleanDataDirectory();

      const allJobId = await exportAllTenants();
      if (waitFlag && allJobId) {
        await waitForCompletion(allJobId);
        // Sync data from Docker volume to host after successful export
        await syncExportData();
      }
      break;
    }

    case 'tenant': {
      if (!arg) {
        console.error('❌ Please provide a tenant ID');
        console.log('Usage: npm run export:tenant <tenantId>');
        process.exit(1);
      }
      const tenantJobId = await exportTenant(arg);
      if (waitFlag && tenantJobId) {
        await waitForCompletion(tenantJobId);
        // Sync data from Docker volume to host after successful export
        await syncExportData();
      }
      break;
    }

    case 'status':
      if (!arg) {
        console.error('❌ Please provide a job ID');
        console.log('Usage: npm run export:status <jobId>');
        process.exit(1);
      }
      await checkStatus(arg);
      break;

    default:
      console.log('📦 Verta Data Export CLI');
      console.log('');
      console.log('Commands:');
      console.log('  npm run export:all [--wait]        Export all tenants');
      console.log(
        '  npm run export:tenant <id> [--wait] Export specific tenant'
      );
      console.log('  npm run export:status <jobId>      Check job status');
      console.log('');
      console.log('Options:');
      console.log('  --wait    Wait for job completion');
      process.exit(0);
  }
}

main().catch(console.error);
