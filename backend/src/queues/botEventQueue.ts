import { Queue, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { redisConfig } from '../config/redis.js';

/**
 * Bot event job data for processing Discord bot events
 */
export interface BotEventJobData {
  type: 'thread_create' | 'slash_command';
  tenantId: string;
  channelId: string;
  threadId?: string;
  userId: string;
  content: string;
  context?: Array<{
    id: string;
    content: string;
    authorId: string;
    authorUsername: string;
    timestamp: string;
  }>;
  timestamp: Date;
  // For slash commands, store interaction details to update the deferred reply
  interaction?: {
    token: string;
    id: string;
    applicationId: string;
  };
}

/**
 * Bot event job result
 */
export interface BotEventJobResult {
  success: boolean;
  response?: {
    content: string;
    confidence: 'high' | 'medium' | 'low';
    sources: Array<{
      type: 'golden_answer' | 'message' | 'knowledge_base';
      title: string;
      url?: string;
    }>;
    searchResultCount: number;
  };
  error?: string;
  processingTimeMs?: number;
}

/**
 * Create the bot event queue
 */
export function createBotEventQueue(redis: Redis): Queue<BotEventJobData, BotEventJobResult> {
  return new Queue<BotEventJobData, BotEventJobResult>('bot-events', {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000, // Start with 2 seconds
      },
      removeOnComplete: {
        age: 24 * 3600, // Keep completed jobs for 1 day
        count: 500, // Keep last 500 completed jobs
      },
      removeOnFail: {
        age: 7 * 24 * 3600, // Keep failed jobs for 7 days
        count: 100, // Keep last 100 failed jobs
      },
    },
  });
}

/**
 * Create queue events listener for bot events
 */
export function createBotEventQueueEvents(redis: Redis): QueueEvents {
  return new QueueEvents('bot-events', {
    connection: redis,
  });
}

/**
 * Queue instance (singleton)
 */
let botEventQueue: Queue<BotEventJobData, BotEventJobResult> | null = null;
let botEventQueueEvents: QueueEvents | null = null;

/**
 * Get or create the bot event queue
 */
export function getBotEventQueue(): Queue<BotEventJobData, BotEventJobResult> {
  if (!botEventQueue) {
    const redis = new Redis(redisConfig);
    botEventQueue = createBotEventQueue(redis);
  }
  return botEventQueue;
}

/**
 * Get or create bot event queue events
 */
export function getBotEventQueueEvents(): QueueEvents {
  if (!botEventQueueEvents) {
    const redis = new Redis(redisConfig);
    botEventQueueEvents = createBotEventQueueEvents(redis);
  }
  return botEventQueueEvents;
}

/**
 * Add a bot event job to the queue
 */
export async function addBotEventJob(
  data: BotEventJobData,
  options?: {
    priority?: number;
    delay?: number;
  }
): Promise<string> {
  const queue = getBotEventQueue();
  const job = await queue.add('process-bot-event', data, {
    priority: options?.priority,
    delay: options?.delay,
  });
  return job.id!;
}

/**
 * Get bot event job status
 */
export async function getBotEventJobStatus(jobId: string) {
  const queue = getBotEventQueue();
  const job = await queue.getJob(jobId);

  if (!job) {
    return null;
  }

  const state = await job.getState();
  const progress = job.progress;

  return {
    id: job.id,
    state,
    progress,
    data: job.data,
    result: job.returnvalue,
    failedReason: job.failedReason,
    attemptsMade: job.attemptsMade,
  };
}

/**
 * Get bot event queue metrics
 */
export async function getBotEventQueueMetrics() {
  const queue = getBotEventQueue();

  const [waitingCount, activeCount, completedCount, failedCount, delayedCount] =
    await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

  return {
    waiting: waitingCount,
    active: activeCount,
    completed: completedCount,
    failed: failedCount,
    delayed: delayedCount,
    total: waitingCount + activeCount + delayedCount,
  };
}

/**
 * Close bot event queue connections
 */
export async function closeBotEventQueue(): Promise<void> {
  if (botEventQueue) {
    await botEventQueue.close();
    botEventQueue = null;
  }
  if (botEventQueueEvents) {
    await botEventQueueEvents.close();
    botEventQueueEvents = null;
  }
}