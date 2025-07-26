#!/usr/bin/env tsx
/**
 * CLI script for triggering data exports
 */

import axios from 'axios';
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

    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }
}

// Main CLI logic
async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];
  const waitFlag = process.argv.includes('--wait');

  switch (command) {
    case 'all':
      const allJobId = await exportAllTenants();
      if (waitFlag && allJobId) {
        await waitForCompletion(allJobId);
      }
      break;

    case 'tenant':
      if (!arg) {
        console.error('❌ Please provide a tenant ID');
        console.log('Usage: npm run export:tenant <tenantId>');
        process.exit(1);
      }
      const tenantJobId = await exportTenant(arg);
      if (waitFlag && tenantJobId) {
        await waitForCompletion(tenantJobId);
      }
      break;

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
