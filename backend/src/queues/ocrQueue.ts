import { Queue, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { redisConfig } from '../config/redis.js';

/**
 * OCR job data for processing image attachments
 */
export interface OcrJobData {
  tenantId: string;
  messageId: string;
  attachmentId: string;
  attachmentUrl: string;
  attachmentFilename: string;
  attempt?: number; // Track retry attempts
}

/**
 * OCR job result
 */
export interface OcrJobResult {
  success: boolean;
  text?: string;
  full_response?: string;
  visual_context?: string;
  confidence?: number;
  processingTimeMs?: number;
  model_used?: string;
  model_name?: string;
  attempts?: number;
  error?: string;
  version?: number;
}

/**
 * Create the OCR queue
 */
export function createOcrQueue(redis: Redis): Queue<OcrJobData, OcrJobResult> {
  return new Queue<OcrJobData, OcrJobResult>('ocr-processing', {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000, // Start with 5 seconds
      },
      removeOnComplete: {
        age: 24 * 3600, // Keep completed jobs for 1 day
        count: 100, // Keep last 100 completed jobs
      },
      removeOnFail: {
        age: 7 * 24 * 3600, // Keep failed jobs for 7 days
        count: 1000, // Keep last 1000 failed jobs
      },
    },
  });
}

/**
 * Create queue events listener for OCR
 */
export function createOcrQueueEvents(redis: Redis): QueueEvents {
  return new QueueEvents('ocr-processing', {
    connection: redis,
  });
}

/**
 * Queue instance (singleton)
 */
let ocrQueue: Queue<OcrJobData, OcrJobResult> | null = null;
let ocrQueueEvents: QueueEvents | null = null;

/**
 * Get or create the OCR queue
 */
export function getOcrQueue(): Queue<OcrJobData, OcrJobResult> {
  if (!ocrQueue) {
    const redis = new Redis(redisConfig);
    ocrQueue = createOcrQueue(redis);
  }
  return ocrQueue;
}

/**
 * Get or create OCR queue events
 */
export function getOcrQueueEvents(): QueueEvents {
  if (!ocrQueueEvents) {
    const redis = new Redis(redisConfig);
    ocrQueueEvents = createOcrQueueEvents(redis);
  }
  return ocrQueueEvents;
}

/**
 * Add an OCR job to the queue
 */
export async function addOcrJob(
  data: OcrJobData,
  options?: {
    priority?: number;
    delay?: number;
  }
): Promise<string> {
  const queue = getOcrQueue();
  const job = await queue.add('process-ocr', data, {
    priority: options?.priority,
    delay: options?.delay,
  });
  return job.id!;
}

/**
 * Add multiple OCR jobs to the queue (batch)
 */
export async function addOcrJobsBatch(
  jobs: Array<{
    data: OcrJobData;
    options?: {
      priority?: number;
      delay?: number;
    };
  }>
): Promise<string[]> {
  const queue = getOcrQueue();
  const bulkJobs = jobs.map(({ data, options }) => ({
    name: 'process-ocr',
    data,
    opts: {
      priority: options?.priority,
      delay: options?.delay,
    },
  }));

  const addedJobs = await queue.addBulk(bulkJobs);
  return addedJobs.map((job) => job.id!);
}

/**
 * Get OCR job status
 */
export async function getOcrJobStatus(jobId: string) {
  const queue = getOcrQueue();
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
 * Get OCR queue metrics
 */
export async function getOcrQueueMetrics() {
  const queue = getOcrQueue();

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
 * Close OCR queue connections
 */
export async function closeOcrQueue(): Promise<void> {
  if (ocrQueue) {
    await ocrQueue.close();
    ocrQueue = null;
  }
  if (ocrQueueEvents) {
    await ocrQueueEvents.close();
    ocrQueueEvents = null;
  }
}
