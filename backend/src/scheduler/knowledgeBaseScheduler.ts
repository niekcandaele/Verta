import { Queue, Job } from 'bullmq';
import { 
  getKnowledgeBaseQueue, 
  addKnowledgeBaseSitemapJob,
  KnowledgeBaseCrawlJobResult,
  KnowledgeBaseSitemapJobData
} from '../queues/knowledgeBaseQueue.js';
import { KnowledgeBaseRepositoryImpl } from '../repositories/knowledgeBase/KnowledgeBaseRepository.js';
import { db } from '../database/index.js';
import logger from '../utils/logger.js';

/**
 * Knowledge base scheduler for automated weekly crawls
 */
export class KnowledgeBaseScheduler {
  private queue: Queue;
  private knowledgeBaseRepo: KnowledgeBaseRepositoryImpl;
  private schedulerJobId = 'knowledge-base-weekly-crawl';

  constructor() {
    this.queue = getKnowledgeBaseQueue();
    this.knowledgeBaseRepo = new KnowledgeBaseRepositoryImpl(db);
  }

  /**
   * Start the weekly scheduler
   * Runs every Sunday at 2:00 AM UTC (0 2 * * 0)
   */
  async start(): Promise<void> {
    try {
      logger.info('Starting knowledge base weekly scheduler');

      // Use BullMQ Job Scheduler to create weekly repeatable job
      await this.queue.upsertJobScheduler(
        this.schedulerJobId,
        {
          pattern: '0 2 * * 0', // Every Sunday at 2:00 AM UTC
        },
        {
          name: 'weekly-crawl-all-knowledge-bases',
          data: { 
            scheduledBy: 'system',
            type: 'weekly-auto-crawl',
            timestamp: new Date().toISOString()
          },
          opts: {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 60000, // 1 minute initial delay for scheduler jobs
            },
            removeOnComplete: {
              age: 30 * 24 * 3600, // Keep completed scheduler jobs for 30 days
              count: 10, // Keep last 10 completed scheduler jobs
            },
            removeOnFail: {
              age: 30 * 24 * 3600, // Keep failed scheduler jobs for 30 days
              count: 20, // Keep last 20 failed scheduler jobs
            },
          },
        }
      );

      logger.info('Knowledge base weekly scheduler started successfully');
    } catch (error) {
      logger.error('Failed to start knowledge base weekly scheduler', { error });
      throw error;
    }
  }

  /**
   * Stop the weekly scheduler
   */
  async stop(): Promise<void> {
    try {
      logger.info('Stopping knowledge base weekly scheduler');
      
      // Remove the job scheduler
      await this.queue.removeJobScheduler(this.schedulerJobId);
      
      logger.info('Knowledge base weekly scheduler stopped successfully');
    } catch (error) {
      logger.error('Failed to stop knowledge base weekly scheduler', { error });
      throw error;
    }
  }

  /**
   * Process the weekly crawl job
   * This method is called by the worker when the scheduled job runs
   */
  async processWeeklyCrawl(job: Job): Promise<KnowledgeBaseCrawlJobResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let knowledgeBasesProcessed = 0;
    let jobsQueued = 0;

    try {
      logger.info('Starting weekly knowledge base crawl', { 
        jobId: job.id,
        scheduledBy: job.data.scheduledBy 
      });

      // Get all knowledge bases across all tenants
      const allKnowledgeBasesResult = await this.knowledgeBaseRepo.findAll({ limit: 1000 });
      const allKnowledgeBases = allKnowledgeBasesResult.data;
      
      if (allKnowledgeBases.length === 0) {
        logger.info('No knowledge bases found for weekly crawl');
        return {
          success: true,
          knowledgeBaseId: 'weekly-scheduler',
          urlsProcessed: 0,
          chunksCreated: 0,
          chunksUpdated: 0,
          errors: [],
          processingTimeMs: Date.now() - startTime,
          lastCrawledAt: new Date().toISOString(),
          status: 'completed'
        };
      }

      logger.info(`Found ${allKnowledgeBases.length} knowledge bases for weekly crawl`);

      // Create sitemap jobs for all knowledge bases
      const queuedJobIds: string[] = [];
      
      for (let i = 0; i < allKnowledgeBases.length; i++) {
        const kb = allKnowledgeBases[i];
        
        const sitemapJobData: KnowledgeBaseSitemapJobData = {
          knowledgeBaseId: kb.id,
          tenantId: kb.tenant_id,
          sitemapUrl: kb.sitemap_url,
          name: kb.name,
          isInitialCrawl: false, // Weekly crawls are updates
          parentJobId: job.id, // Track the weekly crawl job as parent
        };

        // Queue the sitemap job with staggered delay
        const jobId = await addKnowledgeBaseSitemapJob(sitemapJobData, {
          priority: 5, // Lower priority than manual crawls
          delay: i * 30000, // Stagger jobs by 30 seconds to avoid overwhelming target servers
        });
        
        queuedJobIds.push(jobId);
      }
      
      knowledgeBasesProcessed = allKnowledgeBases.length;
      jobsQueued = queuedJobIds.length;

      logger.info('Weekly knowledge base crawl completed successfully', {
        knowledgeBasesProcessed,
        jobsQueued,
        processingTimeMs: Date.now() - startTime,
        queuedJobIds: queuedJobIds.slice(0, 5), // Log first 5 job IDs
      });

      // Update progress
      await job.updateProgress(100);

      return {
        success: true,
        knowledgeBaseId: 'weekly-scheduler',
        urlsProcessed: knowledgeBasesProcessed, // Number of KB configs processed
        chunksCreated: 0, // No chunks created directly by scheduler
        chunksUpdated: 0, // No chunks updated directly by scheduler  
        errors,
        processingTimeMs: Date.now() - startTime,
        lastCrawledAt: new Date().toISOString(),
        status: 'completed' as const
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(errorMessage);
      
      logger.error('Weekly knowledge base crawl failed', {
        error: errorMessage,
        processingTimeMs: Date.now() - startTime,
        knowledgeBasesProcessed,
        jobsQueued
      });

      return {
        success: false,
        knowledgeBaseId: 'weekly-scheduler',
        urlsProcessed: knowledgeBasesProcessed,
        chunksCreated: 0,
        chunksUpdated: 0,
        errors,
        processingTimeMs: Date.now() - startTime,
        lastCrawledAt: new Date().toISOString(),
        status: 'failed' as const
      };
    }
  }

  /**
   * Get scheduler status
   */
  async getStatus(): Promise<{
    isActive: boolean;
    nextRun: Date | null;
    lastRun: Date | null;
  }> {
    try {
      // Check if scheduler job exists
      const schedulerJobs = await this.queue.getJobSchedulers();
      const ourScheduler = schedulerJobs.find(scheduler => scheduler.id === this.schedulerJobId);
      
      if (!ourScheduler) {
        return {
          isActive: false,
          nextRun: null,
          lastRun: null,
        };
      }

      // Get the most recent job created by this scheduler
      const jobs = await this.queue.getJobs(['delayed', 'completed'], 0, 10);
      const schedulerJob = jobs.find(job => 
        job.name === 'weekly-crawl-all-knowledge-bases' &&
        job.data.scheduledBy === 'system'
      );

      return {
        isActive: true,
        nextRun: schedulerJob?.opts?.delay ? new Date(Date.now() + schedulerJob.opts.delay) : null,
        lastRun: schedulerJob?.finishedOn ? new Date(schedulerJob.finishedOn) : null,
      };
    } catch (error) {
      logger.error('Failed to get scheduler status', { error });
      return {
        isActive: false,
        nextRun: null,
        lastRun: null,
      };
    }
  }

  /**
   * Trigger an immediate crawl of all knowledge bases
   * Useful for testing or manual admin triggers
   */
  async triggerImmediateCrawl(): Promise<string> {
    const job = await this.queue.add('weekly-crawl-all-knowledge-bases', {
      scheduledBy: 'admin',
      type: 'manual-crawl-all',
      timestamp: new Date().toISOString()
    }, {
      priority: 10, // High priority for manual triggers
      attempts: 3,
    });

    logger.info('Immediate crawl of all knowledge bases triggered', { jobId: job.id });
    return job.id!;
  }
}

/**
 * Global scheduler instance
 */
let globalScheduler: KnowledgeBaseScheduler | null = null;

/**
 * Get or create the global scheduler instance
 */
export function getKnowledgeBaseScheduler(): KnowledgeBaseScheduler {
  if (!globalScheduler) {
    globalScheduler = new KnowledgeBaseScheduler();
  }
  return globalScheduler;
}

/**
 * Start the knowledge base scheduler
 */
export async function startKnowledgeBaseScheduler(): Promise<void> {
  const scheduler = getKnowledgeBaseScheduler();
  await scheduler.start();
}

/**
 * Stop the knowledge base scheduler
 */
export async function stopKnowledgeBaseScheduler(): Promise<void> {
  if (globalScheduler) {
    await globalScheduler.stop();
    globalScheduler = null;
  }
}