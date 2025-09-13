import { Queue, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { redisConfig } from '../config/redis.js';

/**
 * Knowledge base crawl job data
 */
export interface KnowledgeBaseCrawlJobData {
  knowledgeBaseId: string;
  tenantId: string;
  sitemapUrl: string;
  name: string;
  isInitialCrawl: boolean; // True for first crawl, false for updates
  attempt?: number; // Track retry attempts
}

/**
 * Knowledge base crawl job result
 */
export interface KnowledgeBaseCrawlJobResult {
  success: boolean;
  knowledgeBaseId: string;
  urlsProcessed: number;
  chunksCreated: number;
  chunksUpdated: number;
  errors: string[];
  processingTimeMs: number;
  lastCrawledAt: string;
  status: 'completed' | 'failed' | 'partial';
}

/**
 * Knowledge base sitemap job data
 * This job fetches the sitemap and creates individual URL jobs
 */
export interface KnowledgeBaseSitemapJobData {
  knowledgeBaseId: string;
  tenantId: string;
  sitemapUrl: string;
  name: string;
  isInitialCrawl: boolean;
  parentJobId?: string; // For tracking weekly crawl parent
}

/**
 * Knowledge base URL job data
 * This job processes a single URL from the sitemap
 */
export interface KnowledgeBaseUrlJobData {
  knowledgeBaseId: string;
  tenantId: string;
  url: string;
  urlMetadata?: {
    lastmod?: string;
    changefreq?: string;
    priority?: string;
  };
  isInitialCrawl: boolean;
  sitemapJobId: string; // Parent sitemap job ID
  urlIndex: number; // Index in the sitemap for progress tracking
  totalUrls: number; // Total URLs in the sitemap
}

/**
 * Knowledge base sitemap job result
 */
export interface KnowledgeBaseSitemapJobResult {
  success: boolean;
  knowledgeBaseId: string;
  urlsQueued: number;
  errors: string[];
  processingTimeMs: number;
  sitemapUrl: string;
}

/**
 * Knowledge base URL job result
 */
export interface KnowledgeBaseUrlJobResult {
  success: boolean;
  knowledgeBaseId: string;
  url: string;
  chunksCreated: number;
  chunksUpdated: number;
  error?: string;
  processingTimeMs: number;
}

/**
 * Union type for all job data types
 */
export type KnowledgeBaseJobData = 
  | KnowledgeBaseCrawlJobData 
  | KnowledgeBaseSitemapJobData 
  | KnowledgeBaseUrlJobData;

/**
 * Union type for all job result types
 */
export type KnowledgeBaseJobResult = 
  | KnowledgeBaseCrawlJobResult 
  | KnowledgeBaseSitemapJobResult 
  | KnowledgeBaseUrlJobResult;

/**
 * Create the knowledge base queue
 */
export function createKnowledgeBaseQueue(redis: Redis): Queue<KnowledgeBaseJobData, KnowledgeBaseJobResult> {
  return new Queue<KnowledgeBaseJobData, KnowledgeBaseJobResult>('knowledge-base-crawl', {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 10000, // Start with 10 seconds for web crawling
      },
      removeOnComplete: {
        age: 7 * 24 * 3600, // Keep completed jobs for 7 days
        count: 50, // Keep last 50 completed jobs
      },
      removeOnFail: {
        age: 14 * 24 * 3600, // Keep failed jobs for 14 days
        count: 200, // Keep last 200 failed jobs
      },
    },
  });
}

/**
 * Create queue events listener for knowledge base crawling
 */
export function createKnowledgeBaseQueueEvents(redis: Redis): QueueEvents {
  return new QueueEvents('knowledge-base-crawl', {
    connection: redis,
  });
}

/**
 * Queue instance (singleton)
 */
let knowledgeBaseQueue: Queue<KnowledgeBaseJobData, KnowledgeBaseJobResult> | null = null;
let knowledgeBaseQueueEvents: QueueEvents | null = null;

/**
 * Get or create the knowledge base queue
 */
export function getKnowledgeBaseQueue(): Queue<KnowledgeBaseJobData, KnowledgeBaseJobResult> {
  if (!knowledgeBaseQueue) {
    const redis = new Redis(redisConfig);
    knowledgeBaseQueue = createKnowledgeBaseQueue(redis);
  }
  return knowledgeBaseQueue;
}

/**
 * Get or create knowledge base queue events
 */
export function getKnowledgeBaseQueueEvents(): QueueEvents {
  if (!knowledgeBaseQueueEvents) {
    const redis = new Redis(redisConfig);
    knowledgeBaseQueueEvents = createKnowledgeBaseQueueEvents(redis);
  }
  return knowledgeBaseQueueEvents;
}

/**
 * Add a knowledge base crawl job to the queue
 */
export async function addKnowledgeBaseCrawlJob(
  data: KnowledgeBaseCrawlJobData,
  options?: {
    priority?: number;
    delay?: number;
  }
): Promise<string> {
  const queue = getKnowledgeBaseQueue();
  const job = await queue.add('crawl-knowledge-base', data, {
    priority: options?.priority,
    delay: options?.delay,
  });
  return job.id!;
}

/**
 * Add multiple knowledge base crawl jobs to the queue (batch)
 */
export async function addKnowledgeBaseCrawlJobsBatch(
  jobs: Array<{
    data: KnowledgeBaseCrawlJobData;
    options?: {
      priority?: number;
      delay?: number;
    };
  }>
): Promise<string[]> {
  const queue = getKnowledgeBaseQueue();
  const bulkJobs = jobs.map(({ data, options }) => ({
    name: 'crawl-knowledge-base',
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
 * Get knowledge base crawl job status
 */
export async function getKnowledgeBaseCrawlJobStatus(jobId: string) {
  const queue = getKnowledgeBaseQueue();
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
 * Get knowledge base queue metrics
 */
export async function getKnowledgeBaseQueueMetrics() {
  const queue = getKnowledgeBaseQueue();

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
 * Add a knowledge base sitemap job to the queue
 */
export async function addKnowledgeBaseSitemapJob(
  data: KnowledgeBaseSitemapJobData,
  options?: {
    priority?: number;
    delay?: number;
  }
): Promise<string> {
  const queue = getKnowledgeBaseQueue();
  const job = await queue.add('process-sitemap', data, {
    priority: options?.priority ?? 5,
    delay: options?.delay,
  });
  return job.id!;
}

/**
 * Add a knowledge base URL job to the queue
 */
export async function addKnowledgeBaseUrlJob(
  data: KnowledgeBaseUrlJobData,
  options?: {
    priority?: number;
    delay?: number;
  }
): Promise<string> {
  const queue = getKnowledgeBaseQueue();
  const job = await queue.add('process-url', data, {
    priority: options?.priority ?? 3,
    delay: options?.delay,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // Shorter delay for URL processing
    },
  });
  return job.id!;
}

/**
 * Add multiple knowledge base URL jobs to the queue (batch)
 */
export async function addKnowledgeBaseUrlJobsBatch(
  jobs: Array<{
    data: KnowledgeBaseUrlJobData;
    options?: {
      priority?: number;
      delay?: number;
    };
  }>
): Promise<string[]> {
  const queue = getKnowledgeBaseQueue();
  const bulkJobs = jobs.map(({ data, options }) => ({
    name: 'process-url',
    data,
    opts: {
      priority: options?.priority ?? 3,
      delay: options?.delay,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    },
  }));

  const addedJobs = await queue.addBulk(bulkJobs);
  return addedJobs.map((job) => job.id!);
}


/**
 * Close knowledge base queue connections
 */
export async function closeKnowledgeBaseQueue(): Promise<void> {
  if (knowledgeBaseQueue) {
    await knowledgeBaseQueue.close();
    knowledgeBaseQueue = null;
  }
  if (knowledgeBaseQueueEvents) {
    await knowledgeBaseQueueEvents.close();
    knowledgeBaseQueueEvents = null;
  }
}