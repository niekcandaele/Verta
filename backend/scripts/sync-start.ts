#!/usr/bin/env tsx

import axios from 'axios';

const API_BASE = process.env.API_BASE || 'http://localhost:25000/api';
const API_KEY = process.env.API_KEY || 'ikbeneenaap';

// Parse command line arguments
const args = process.argv.slice(2);
const tenantArg = args.find((arg) => arg.startsWith('--tenant='));
const specificTenant = tenantArg ? tenantArg.split('=')[1] : null;

// Color codes for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Type definitions
interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  platform: string;
  platformId: string;
}

interface JobStatus {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  progress?: {
    channelsTotal?: number;
    channelsCompleted?: number;
    channelsFailed?: number;
    channelsInProgress?: number;
    messagesProcessed?: number;
  };
  result?: {
    channelsProcessed: number;
    messagesProcessed: number;
    reactionsProcessed: number;
    attachmentsProcessed: number;
    errors: Array<{ error: string; timestamp: string }>;
  };
  failedReason?: string;
}

/**
 * Get all tenants from the API
 */
async function getAllTenants(): Promise<Tenant[]> {
  try {
    const response = await axios.get(`${API_BASE}/tenants`, {
      headers: { 'X-API-Key': API_KEY },
      params: { limit: 100 }, // Get up to 100 tenants
    });

    return response.data.data || [];
  } catch (error: any) {
    throw new Error(
      `Failed to fetch tenants: ${error.response?.data?.error || error.message}`
    );
  }
}

/**
 * Trigger sync for a specific tenant
 */
async function syncTenant(
  tenant: Tenant
): Promise<{ tenant: Tenant; jobId: string } | null> {
  try {
    log(`\n🚀 Starting sync for tenant: ${tenant.name} (${tenant.id})`, 'cyan');

    const response = await axios.post(
      `${API_BASE}/sync`,
      {
        tenantId: tenant.id,
        syncType: 'full',
      },
      {
        headers: { 'X-API-Key': API_KEY },
      }
    );

    const jobId = response.data.jobId;
    log(`✅ Sync job created with ID: ${jobId}`, 'green');

    return { tenant, jobId };
  } catch (error: any) {
    log(
      `❌ Failed to start sync for ${tenant.name}: ${
        error.response?.data?.error || error.message
      }`,
      'red'
    );
    return null;
  }
}

/**
 * Check job status
 */
async function checkJobStatus(jobId: string): Promise<JobStatus | null> {
  try {
    const response = await axios.get(`${API_BASE}/sync/jobs/${jobId}`, {
      headers: { 'X-API-Key': API_KEY },
    });

    return response.data;
  } catch {
    return null;
  }
}

/**
 * Wait for job completion
 */
async function waitForJob(jobId: string, tenantName: string): Promise<boolean> {
  let lastChannelsProcessed = -1;
  let lastMessagesProcessed = -1;

  while (true) {
    const status = await checkJobStatus(jobId);

    if (!status) {
      log(`⚠️  Failed to get status for job ${jobId}`, 'yellow');
      return false;
    }

    // Extract progress data
    const progress = status.progress || {};
    const channelsTotal = progress.channelsTotal || 0;
    const channelsCompleted = progress.channelsCompleted || 0;
    const channelsInProgress = progress.channelsInProgress || 0;
    const messagesProcessed = progress.messagesProcessed || 0;

    // Only log if progress changed
    if (
      channelsCompleted !== lastChannelsProcessed ||
      messagesProcessed !== lastMessagesProcessed
    ) {
      const progressPercent =
        channelsTotal > 0
          ? Math.round((channelsCompleted / channelsTotal) * 100)
          : 0;
      process.stdout.write(
        `\r📊 ${tenantName}: ${status.status} - Progress: ${progressPercent}% (Channels: ${channelsCompleted}/${channelsTotal}, In Progress: ${channelsInProgress}, Messages: ${messagesProcessed})`
      );
      lastChannelsProcessed = channelsCompleted;
      lastMessagesProcessed = messagesProcessed;
    }

    if (status.status === 'completed') {
      console.log(''); // New line after progress
      log(`✅ Sync completed for ${tenantName}`, 'green');

      if (status.result) {
        log(
          `   📈 Channels: ${status.result.channelsProcessed}, Messages: ${status.result.messagesProcessed}, Reactions: ${status.result.reactionsProcessed}, Attachments: ${status.result.attachmentsProcessed}`,
          'bright'
        );
        if (status.result.errors.length > 0) {
          log(
            `   ⚠️  Errors encountered: ${status.result.errors.length}`,
            'yellow'
          );
        }
      }
      return true;
    }

    if (status.status === 'failed') {
      console.log(''); // New line after progress
      log(`❌ Sync failed for ${tenantName}`, 'red');
      if (status.failedReason) {
        log(`   Error: ${status.failedReason}`, 'red');
      }
      return false;
    }

    // Wait 2 seconds before checking again
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

/**
 * Main sync function
 */
async function main() {
  try {
    log('\n🔄 Sync Start Tool', 'bright');
    log('==================', 'bright');

    // Get tenants
    let tenants = await getAllTenants();

    if (specificTenant) {
      tenants = tenants.filter(
        (t) => t.id === specificTenant || t.slug === specificTenant
      );
      if (tenants.length === 0) {
        log(`\n❌ Tenant not found: ${specificTenant}`, 'red');
        process.exit(1);
      }
      log(`\n🎯 Syncing specific tenant: ${tenants[0].name}`, 'blue');
    } else {
      log(`\n📋 Found ${tenants.length} tenants to sync`, 'blue');
    }

    // Filter only active tenants
    const activeTenants = tenants.filter((t) => t.status === 'ACTIVE');

    if (activeTenants.length === 0) {
      log('\n⚠️  No active tenants found', 'yellow');
      return;
    }

    log(`\n🎯 Syncing ${activeTenants.length} active tenants...`, 'blue');

    // Start sync for all tenants
    const jobs: Array<{ tenant: Tenant; jobId: string }> = [];
    for (const tenant of activeTenants) {
      const job = await syncTenant(tenant);
      if (job) {
        jobs.push(job);
      }
    }

    if (jobs.length === 0) {
      log('\n❌ No sync jobs were created', 'red');
      return;
    }

    // Wait for all jobs to complete
    log(`\n⏳ Waiting for ${jobs.length} sync jobs to complete...`, 'yellow');

    let successCount = 0;
    for (const { tenant, jobId } of jobs) {
      const success = await waitForJob(jobId, tenant.name);
      if (success) successCount++;
    }

    // Summary
    log('\n📊 Sync Summary', 'bright');
    log('===============', 'bright');
    log(
      `✅ Successful: ${successCount}/${jobs.length}`,
      successCount === jobs.length ? 'green' : 'yellow'
    );

    if (successCount < jobs.length) {
      log(`❌ Failed: ${jobs.length - successCount}/${jobs.length}`, 'red');
    }

    log('\n🎉 Sync process completed!', 'cyan');
  } catch (error: any) {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    process.exit(1);
  }
}

// Run the sync
main().catch((error) => {
  log(`\n❌ Unhandled error: ${error.message}`, 'red');
  process.exit(1);
});
