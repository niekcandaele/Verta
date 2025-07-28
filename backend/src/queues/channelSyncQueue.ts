import { Queue } from 'bullmq';
import { redisConfig } from '../config/redis.js';

export const CHANNEL_SYNC_QUEUE_NAME = 'channel-sync';

export interface ChannelSyncJobData {
  tenantId: string;
  channelId: string;
  platformChannelId: string;
  syncType: 'full' | 'incremental';
  startDate?: Date;
  endDate?: Date;
  parentJobId: string;
}

export const channelSyncQueue = new Queue<ChannelSyncJobData>(
  CHANNEL_SYNC_QUEUE_NAME,
  {
    connection: redisConfig,
    defaultJobOptions: {
      removeOnComplete: {
        age: 24 * 3600, // Keep completed jobs for 24 hours
        count: 100, // Keep last 100 completed jobs per channel
      },
      removeOnFail: {
        age: 7 * 24 * 3600, // Keep failed jobs for 7 days
      },
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000, // Start with 1 second (1s, 2s, 4s)
      },
    },
  }
);
