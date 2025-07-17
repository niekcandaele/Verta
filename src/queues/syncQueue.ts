import { Queue } from 'bullmq';
import { redisConfig } from '../config/redis.js';

export const SYNC_QUEUE_NAME = 'platform-sync';

export const syncQueue = new Queue(SYNC_QUEUE_NAME, {
  connection: redisConfig,
  defaultJobOptions: {
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 100, // Keep last 100 completed jobs
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
});
