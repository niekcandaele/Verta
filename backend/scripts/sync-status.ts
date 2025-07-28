#!/usr/bin/env tsx

import { Queue } from 'bullmq';
import { db } from '../src/database/index.js';
import { redisConfig } from '../src/config/redis.js';
import { SYNC_QUEUE_NAME } from '../src/queues/syncQueue.js';

// Parse command line arguments
const args = process.argv.slice(2);
const jobIdArg = args.find((arg) => arg.startsWith('--job-id='));
const jobId = jobIdArg ? jobIdArg.split('=')[1] : null;

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
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Get job status from BullMQ
 */
async function getBullMQJobStatus(jobId: string) {
  const syncQueue = new Queue(SYNC_QUEUE_NAME, {
    connection: redisConfig,
  });

  try {
    const job = await syncQueue.getJob(jobId);
    if (!job) {
      return null;
    }

    const state = await job.getState();
    const progress = job.progress;

    return {
      id: job.id,
      name: job.name,
      data: job.data,
      state,
      progress,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      failedReason: job.failedReason,
      returnvalue: job.returnvalue,
    };
  } finally {
    await syncQueue.close();
  }
}

/**
 * Get channel sync jobs from database
 */
async function getChannelSyncJobs(parentJobId: string): Promise<any[]> {
  const jobs = await (db as any)
    .selectFrom('channel_sync_jobs as csj')
    .innerJoin('channels as c', 'c.id', 'csj.channel_id')
    .select([
      'csj.id',
      'csj.channel_id',
      'csj.worker_id',
      'csj.status',
      'csj.started_at',
      'csj.completed_at',
      'csj.messages_processed',
      'csj.error_details',
      'c.name as channel_name',
      'c.platform_channel_id',
    ])
    .where('csj.parent_job_id', '=', parentJobId)
    .orderBy('c.name', 'asc')
    .execute();

  return jobs;
}

/**
 * Display job status in a formatted table
 */
async function displayJobStatus(jobId: string) {
  // Get BullMQ job status
  const bullMQJob = await getBullMQJobStatus(jobId);

  if (!bullMQJob) {
    log(`\n❌ Job not found: ${jobId}`, 'red');
    return;
  }

  log('\n📋 Sync Job Status', 'bright');
  log('==================', 'bright');

  // Basic job info
  log(`\nJob ID: ${bullMQJob.id}`, 'cyan');
  log(`Tenant ID: ${bullMQJob.data.tenantId}`, 'cyan');
  log(`Sync Type: ${bullMQJob.data.syncType}`, 'cyan');
  log(
    `State: ${bullMQJob.state}`,
    bullMQJob.state === 'completed' ? 'green' : 'yellow'
  );

  // Timing information
  if (bullMQJob.timestamp) {
    const startTime = new Date(bullMQJob.timestamp);
    log(`\nStarted: ${startTime.toLocaleString()}`, 'cyan');
  }

  if (bullMQJob.finishedOn) {
    const endTime = new Date(bullMQJob.finishedOn);
    log(`Finished: ${endTime.toLocaleString()}`, 'cyan');
    if (bullMQJob.timestamp) {
      const duration = bullMQJob.finishedOn - bullMQJob.timestamp;
      log(`Duration: ${formatDuration(duration)}`, 'cyan');
    }
  }

  // Progress information
  if (bullMQJob.progress) {
    log('\n📊 Progress:', 'bright');
    const progress = bullMQJob.progress as any;
    if (progress.channelsTotal !== undefined) {
      log(
        `   Channels: ${progress.channelsCompleted || 0}/${
          progress.channelsTotal
        } completed`,
        'cyan'
      );
      if (progress.channelsFailed > 0) {
        log(`   Failed: ${progress.channelsFailed} channels`, 'red');
      }
      if (progress.channelsInProgress > 0) {
        log(
          `   In Progress: ${progress.channelsInProgress} channels`,
          'yellow'
        );
      }
    }
    if (progress.messagesProcessed !== undefined) {
      log(`   Messages: ${progress.messagesProcessed} processed`, 'cyan');
    }
  }

  // Result information
  if (bullMQJob.returnvalue) {
    const result = bullMQJob.returnvalue as any;
    log('\n✅ Final Results:', 'bright');
    log(`   Channels Processed: ${result.channelsProcessed || 0}`, 'cyan');
    log(`   Messages Processed: ${result.messagesProcessed || 0}`, 'cyan');
    log(`   Reactions Processed: ${result.reactionsProcessed || 0}`, 'cyan');
    log(
      `   Attachments Processed: ${result.attachmentsProcessed || 0}`,
      'cyan'
    );

    if (result.parallelStats) {
      log('\n📈 Performance Metrics:', 'bright');
      log(
        `   Max Concurrent Channels: ${result.parallelStats.maxConcurrentChannels}`,
        'cyan'
      );
      log(
        `   Average Channel Time: ${formatDuration(
          result.parallelStats.averageChannelTime * 1000
        )}`,
        'cyan'
      );
      const messagesPerSecond =
        result.messagesProcessed /
        ((bullMQJob.finishedOn! - bullMQJob.timestamp) / 1000);
      log(`   Messages/Second: ${messagesPerSecond.toFixed(2)}`, 'cyan');
    }

    if (result.errors && result.errors.length > 0) {
      log('\n❌ Errors:', 'red');
      result.errors.forEach((error: any, index: number) => {
        log(`   ${index + 1}. ${error.error}`, 'red');
        if (error.channelId) {
          log(`      Channel: ${error.channelId}`, 'yellow');
        }
      });
    }
  }

  // Channel sync jobs
  const channelJobs = await getChannelSyncJobs(jobId);
  if (channelJobs.length > 0) {
    log('\n📊 Channel Status:', 'bright');
    log(
      'Channel Name                     | Status      | Messages | Worker',
      'bright'
    );
    log(
      '--------------------------------|-------------|----------|----------------',
      'bright'
    );

    for (const job of channelJobs) {
      const name = job.channel_name.padEnd(31).substring(0, 31);
      const status = (job.status || 'pending').padEnd(11);
      const messages = (job.messages_processed || 0).toString().padEnd(8);
      const worker = (job.worker_id || 'N/A').substring(0, 16);

      const statusColor =
        job.status === 'completed'
          ? 'green'
          : job.status === 'failed'
            ? 'red'
            : job.status === 'in_progress'
              ? 'yellow'
              : 'cyan';

      log(
        `${name} | ${colors[statusColor]}${status}${colors.reset} | ${messages} | ${worker}`,
        'reset'
      );

      if (job.error_details) {
        log(`  └─ Error: ${JSON.stringify(job.error_details)}`, 'red');
      }
    }

    // Summary
    const completed = channelJobs.filter(
      (j: any) => j.status === 'completed'
    ).length;
    const failed = channelJobs.filter((j: any) => j.status === 'failed').length;
    const inProgress = channelJobs.filter(
      (j: any) => j.status === 'in_progress'
    ).length;
    const pending = channelJobs.filter(
      (j: any) => j.status === 'pending'
    ).length;

    log('\n📊 Channel Summary:', 'bright');
    log(`   Total: ${channelJobs.length}`, 'cyan');
    log(`   Completed: ${completed}`, 'green');
    log(`   Failed: ${failed}`, 'red');
    log(`   In Progress: ${inProgress}`, 'yellow');
    log(`   Pending: ${pending}`, 'cyan');
  }

  // Failed reason
  if (bullMQJob.failedReason) {
    log('\n❌ Failed Reason:', 'red');
    log(`   ${bullMQJob.failedReason}`, 'red');
  }
}

/**
 * Main function
 */
async function main() {
  try {
    log('\n🔍 Sync Status Tool', 'bright');
    log('===================', 'bright');

    if (!jobId) {
      log('\n❌ Error: --job-id parameter is required', 'red');
      log('Usage: npm run sync:status -- --job-id=<job-id>', 'yellow');
      process.exit(1);
    }

    await displayJobStatus(jobId);

    log('', 'reset'); // Empty line
  } catch (error: any) {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

// Run the status check
main().catch((error) => {
  log(`\n❌ Unhandled error: ${error.message}`, 'red');
  process.exit(1);
});
