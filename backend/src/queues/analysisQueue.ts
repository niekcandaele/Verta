import { Queue, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { redisConfig } from '../config/redis.js';

/**
 * Job data for thread analysis
 */
export interface AnalysisJobData {
  tenantId: string;
  channelIds?: string[]; // Optional: specific channels to analyze
  threadMinAgeDays?: number; // Override default thread age
  forceReprocess?: boolean; // Reprocess already analyzed threads
}

/**
 * Job result for thread analysis
 */
export interface AnalysisJobResult {
  threadsProcessed: number;
  questionsExtracted: number;
  clustersCreated: number;
  clustersUpdated: number;
  errors: Array<{
    threadId: string;
    error: string;
  }>;
}

/**
 * Create the analysis queue
 */
export function createAnalysisQueue(
  redis: Redis
): Queue<AnalysisJobData, AnalysisJobResult> {
  return new Queue<AnalysisJobData, AnalysisJobResult>('thread-analysis', {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: {
        age: 24 * 3600, // Keep completed jobs for 24 hours
        count: 100, // Keep last 100 completed jobs
      },
      removeOnFail: {
        age: 24 * 3600, // Keep failed jobs for 1 day
      },
    },
  });
}

/**
 * Create queue events listener
 */
export function createAnalysisQueueEvents(redis: Redis): QueueEvents {
  return new QueueEvents('thread-analysis', {
    connection: redis,
  });
}

/**
 * Queue instance (singleton)
 */
let analysisQueue: Queue<AnalysisJobData, AnalysisJobResult> | null = null;
let queueEvents: QueueEvents | null = null;

/**
 * Get or create the analysis queue
 */
export function getAnalysisQueue(): Queue<AnalysisJobData, AnalysisJobResult> {
  if (!analysisQueue) {
    const redis = new Redis(redisConfig);
    analysisQueue = createAnalysisQueue(redis);
  }
  return analysisQueue;
}

/**
 * Get or create queue events
 */
export function getAnalysisQueueEvents(): QueueEvents {
  if (!queueEvents) {
    const redis = new Redis(redisConfig);
    queueEvents = createAnalysisQueueEvents(redis);
  }
  return queueEvents;
}

/**
 * Add a thread analysis job to the queue
 */
export async function addAnalysisJob(
  data: AnalysisJobData,
  options?: {
    priority?: number;
    delay?: number;
  }
): Promise<string> {
  const queue = getAnalysisQueue();
  const job = await queue.add('analyze-threads', data, {
    priority: options?.priority,
    delay: options?.delay,
  });
  return job.id!;
}

/**
 * Add a golden answer embedding generation job to the queue
 */
export async function addGoldenAnswerEmbeddingJob(
  data: Pick<AnalysisJobData, 'tenantId'>,
  options?: {
    priority?: number;
    delay?: number;
  }
): Promise<string> {
  const queue = getAnalysisQueue();
  const job = await queue.add(
    'generate-golden-answer-embeddings',
    data as AnalysisJobData,
    {
      priority: options?.priority,
      delay: options?.delay,
    }
  );
  return job.id!;
}

/**
 * Add a message embedding generation job to the queue
 */
export async function addMessageEmbeddingJob(
  data: AnalysisJobData,
  options?: {
    priority?: number;
    delay?: number;
  }
): Promise<string> {
  const queue = getAnalysisQueue();
  const job = await queue.add('generate-message-embeddings', data, {
    priority: options?.priority,
    delay: options?.delay,
  });
  return job.id!;
}

/**
 * Get job status
 */
export async function getJobStatus(jobId: string) {
  const queue = getAnalysisQueue();
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
 * Close queue connections
 */
export async function closeAnalysisQueue(): Promise<void> {
  if (analysisQueue) {
    await analysisQueue.close();
    analysisQueue = null;
  }
  if (queueEvents) {
    await queueEvents.close();
    queueEvents = null;
  }
}
