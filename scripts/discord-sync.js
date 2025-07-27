#!/usr/bin/env node

const axios = require('axios');
const { spawn } = require('child_process');

const API_BASE = 'http://localhost:25000/api';
const API_KEY = 'ikbeneenaap';

// Parse command line arguments
const args = process.argv.slice(2);
const tenantArg = args.find(arg => arg.startsWith('--tenant='));
const specificTenant = tenantArg ? tenantArg.split('=')[1] : null;

// Color codes for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Get all tenants from the API
 */
async function getAllTenants() {
  try {
    const response = await axios.get(`${API_BASE}/tenants`, {
      headers: { 'X-API-Key': API_KEY },
      params: { limit: 100 } // Get up to 100 tenants
    });
    
    return response.data.data || [];
  } catch (error) {
    throw new Error(`Failed to fetch tenants: ${error.response?.data?.error || error.message}`);
  }
}

/**
 * Trigger sync for a specific tenant
 */
async function syncTenant(tenant) {
  try {
    log(`\n🚀 Starting sync for tenant: ${tenant.name} (${tenant.id})`, 'cyan');
    
    const response = await axios.post(
      `${API_BASE}/sync`,
      {
        tenantId: tenant.id,
        syncType: 'full'
      },
      {
        headers: { 'X-API-Key': API_KEY }
      }
    );
    
    const jobId = response.data.jobId;
    log(`✅ Sync job created with ID: ${jobId}`, 'green');
    
    return { tenant, jobId };
  } catch (error) {
    log(`❌ Failed to start sync for ${tenant.name}: ${error.response?.data?.error || error.message}`, 'red');
    return null;
  }
}

/**
 * Check job status
 */
async function checkJobStatus(jobId) {
  try {
    const response = await axios.get(
      `${API_BASE}/sync/jobs/${jobId}`,
      {
        headers: { 'X-API-Key': API_KEY }
      }
    );
    
    return response.data;
  } catch (error) {
    return null;
  }
}

/**
 * Wait for job completion
 */
async function waitForJob(jobId, tenantName) {
  let lastProgress = -1;
  
  while (true) {
    const status = await checkJobStatus(jobId);
    
    if (!status) {
      log(`⚠️  Failed to get status for job ${jobId}`, 'yellow');
      return false;
    }
    
    // Calculate progress percentage
    const progressData = status.progress || {};
    const progressPercent = progressData.channelsProcessed ? 
      Math.round((progressData.channelsProcessed / 21) * 100) : 0;
    
    // Only log if progress changed
    if (progressPercent !== lastProgress) {
      process.stdout.write(`\r📊 ${tenantName}: ${status.status} - Progress: ${progressPercent}% (Channels: ${progressData.channelsProcessed || 0}, Messages: ${progressData.messagesProcessed || 0})`);
      lastProgress = progressPercent;
    }
    
    if (status.status === 'completed') {
      console.log(''); // New line after progress
      log(`✅ Sync completed for ${tenantName}`, 'green');
      
      if (status.result) {
        log(`   📈 Channels: ${status.result.channelsProcessed || 0}, Messages: ${status.result.messagesProcessed || 0}`, 'bright');
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
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

/**
 * Main sync function
 */
async function main() {
  try {
    log('\n🔄 Discord Sync Tool', 'bright');
    log('==================', 'bright');
    
    // Get tenants
    let tenants = await getAllTenants();
    
    if (specificTenant) {
      tenants = tenants.filter(t => t.id === specificTenant || t.slug === specificTenant);
      if (tenants.length === 0) {
        log(`\n❌ Tenant not found: ${specificTenant}`, 'red');
        process.exit(1);
      }
      log(`\n🎯 Syncing specific tenant: ${tenants[0].name}`, 'blue');
    } else {
      log(`\n📋 Found ${tenants.length} tenants to sync`, 'blue');
    }
    
    // Filter only active tenants
    const activeTenants = tenants.filter(t => t.status === 'ACTIVE');
    
    if (activeTenants.length === 0) {
      log('\n⚠️  No active tenants found', 'yellow');
      return;
    }
    
    log(`\n🎯 Syncing ${activeTenants.length} active tenants...`, 'blue');
    
    // Start sync for all tenants
    const jobs = [];
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
    log(`✅ Successful: ${successCount}/${jobs.length}`, successCount === jobs.length ? 'green' : 'yellow');
    
    if (successCount < jobs.length) {
      log(`❌ Failed: ${jobs.length - successCount}/${jobs.length}`, 'red');
    }
    
    log('\n🎉 Discord sync process completed!', 'cyan');
    
  } catch (error) {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    process.exit(1);
  }
}

// Run the sync
main().catch(error => {
  log(`\n❌ Unhandled error: ${error.message}`, 'red');
  process.exit(1);
});