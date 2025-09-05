import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { Kysely } from 'kysely';
import { redisConfig } from '../config/redis.js';
import { mlConfig } from '../config/ml.js';
import { Database } from '../database/types.js';
import { db as database } from '../database/index.js';
import { QuestionInstanceRepository } from '../repositories/QuestionInstanceRepository.js';
import { AnalysisJobRepository } from '../repositories/AnalysisJobRepository.js';
import { ThreadProcessingService } from '../services/ThreadProcessingService.js';
import { ClusteringService } from '../services/ClusteringService.js';
import logger from '../utils/logger.js';
import type {
  AnalysisJobData,
  AnalysisJobResult,
} from '../queues/analysisQueue.js';

/**
 * Thread analysis worker
 * Processes Discord threads to extract and cluster questions
 */
export class AnalysisWorker {
  private worker: Worker<AnalysisJobData, AnalysisJobResult> | null = null;
  private db: Kysely<Database>;
  private instanceRepo: QuestionInstanceRepository;
  private jobRepo: AnalysisJobRepository;
  private threadService: ThreadProcessingService;
  private clusteringService: ClusteringService;

  constructor(db?: Kysely<Database>) {
    this.db = db || database;
    this.instanceRepo = new QuestionInstanceRepository(this.db);
    this.jobRepo = new AnalysisJobRepository(this.db);
    this.threadService = new ThreadProcessingService(this.db);
    this.clusteringService = new ClusteringService(this.db);
  }

  /**
   * Start the worker
   */
  async start(): Promise<void> {
    const redis = new Redis(redisConfig);

    this.worker = new Worker<AnalysisJobData, AnalysisJobResult>(
      'thread-analysis',
      async (job: Job<AnalysisJobData>) => {
        return this.processJob(job);
      },
      {
        connection: redis,
        concurrency: 1, // Process one job at a time
        autorun: true,
      }
    );

    // Set up event listeners
    this.worker.on('completed', (job) => {
      logger.info('Analysis job completed', {
        jobId: job.id,
        tenantId: job.data.tenantId,
        result: job.returnvalue,
      });
    });

    this.worker.on('failed', (job, err) => {
      logger.error('Analysis job failed', {
        jobId: job?.id,
        tenantId: job?.data.tenantId,
        error: err.message,
        stack: err.stack,
      });
    });

    logger.info('Analysis worker started');
  }

  /**
   * Stop the worker
   */
  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    logger.info('Analysis worker stopped');
  }

  /**
   * Process a job
   */
  private async processJob(
    job: Job<AnalysisJobData>
  ): Promise<AnalysisJobResult> {
    const { tenantId, channelIds, threadMinAgeDays, forceReprocess } = job.data;

    const result: AnalysisJobResult = {
      threadsProcessed: 0,
      questionsExtracted: 0,
      clustersCreated: 0,
      clustersUpdated: 0,
      errors: [],
    };

    try {
      // Create or update analysis job record
      const analysisJob = await this.jobRepo.create({
        tenant_id: tenantId,
        status: 'processing',
        job_type: 'thread_analysis',
        parameters: job.data,
        thread_min_age_days: threadMinAgeDays || mlConfig.threadMinAgeDays,
      });

      // Update job progress
      await job.updateProgress({
        stage: 'fetching_threads',
        processed: 0,
        total: 0,
      });

      // Update database job status
      await this.jobRepo.update(analysisJob.id, {
        status: 'processing',
        started_at: new Date().toISOString(),
      });

      // Fetch eligible threads
      const threads = await this.fetchEligibleThreads(
        tenantId,
        channelIds,
        threadMinAgeDays || mlConfig.threadMinAgeDays
      );

      const totalThreads = threads.length;
      logger.info(
        `Found ${totalThreads} eligible threads for tenant ${tenantId}`
      );

      await job.updateProgress({
        stage: 'processing_threads',
        processed: 0,
        total: totalThreads,
      });

      // Update database with total items
      await this.jobRepo.update(analysisJob.id, {
        total_items: totalThreads,
      });

      // Process each thread
      for (let i = 0; i < threads.length; i++) {
        const thread = threads[i];

        try {
          // Check if already processed (unless force reprocess)
          if (!forceReprocess) {
            const existing = await this.instanceRepo.findByThreadId(thread.id);
            if (existing) {
              logger.debug(`Thread ${thread.id} already processed, skipping`);
              continue;
            }
          }

          // Process the thread
          const threadResult = await this.processThread(thread, tenantId);

          if (threadResult.questionExtracted) {
            result.questionsExtracted++;
          }
          if (threadResult.clusterCreated) {
            result.clustersCreated++;
          }
          if (threadResult.clusterUpdated) {
            result.clustersUpdated++;
          }

          result.threadsProcessed++;

          // Update progress
          await job.updateProgress({
            stage: 'processing_threads',
            processed: i + 1,
            total: totalThreads,
            current: thread.name || thread.id,
          });

          // Periodically update database progress
          if ((i + 1) % 10 === 0 || i === threads.length - 1) {
            await this.jobRepo.update(analysisJob.id, {
              processed_items: i + 1,
            });
          }
        } catch (error: any) {
          logger.error(`Failed to process thread ${thread.id}`, error);
          result.errors.push({
            threadId: thread.id,
            error: error.message,
          });
        }
      }

      // Update analysis job as completed
      await this.jobRepo.update(analysisJob.id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        processed_items: result.threadsProcessed,
        total_items: totalThreads,
      });

      logger.info('Analysis job completed', result);
      return result;
    } catch (error: any) {
      logger.error('Analysis job failed', error);
      throw error;
    }
  }

  /**
   * Fetch eligible threads for processing
   * Only returns threads where the first message is older than threadMinAgeDays
   */
  private async fetchEligibleThreads(
    tenantId: string,
    channelIds?: string[],
    threadMinAgeDays: number = 5
  ) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - threadMinAgeDays);

    // First get thread channels
    let query = this.db
      .selectFrom('channels')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('type', '=', 'thread');

    if (channelIds && channelIds.length > 0) {
      query = query.where('id', 'in', channelIds);
    }

    const threads = await query.execute();

    // Filter threads based on first message age
    const eligibleThreads = [];
    for (const thread of threads) {
      // Get the first message in the thread
      const firstMessage = await this.db
        .selectFrom('messages')
        .select(['platform_created_at'])
        .where('channel_id', '=', thread.id)
        .orderBy('platform_created_at', 'asc')
        .limit(1)
        .executeTakeFirst();

      if (
        firstMessage &&
        new Date(firstMessage.platform_created_at) <= cutoffDate
      ) {
        eligibleThreads.push(thread);
      }
    }

    logger.info(
      `Found ${eligibleThreads.length} eligible threads out of ${threads.length} total threads`
    );
    return eligibleThreads;
  }

  /**
   * Process a single thread
   */
  private async processThread(
    thread: any,
    tenantId: string
  ): Promise<{
    questionExtracted: boolean;
    clusterCreated: boolean;
    clusterUpdated: boolean;
  }> {
    const result = {
      questionExtracted: false,
      clusterCreated: false,
      clusterUpdated: false,
    };

    try {
      logger.info(`Processing thread ${thread.id}: ${thread.name}`);

      // Process the thread to extract question
      const threadData = await this.threadService.processThread(
        thread.id,
        thread.name
      );

      if (!threadData) {
        logger.warn(`No question found in thread ${thread.id}: ${thread.name}`);
        return result;
      }

      result.questionExtracted = true;

      // Cluster the question with actual message dates
      const clusterResult = await this.clusteringService.clusterQuestion(
        tenantId,
        thread.id,
        thread.name,
        threadData.extractedQuestion,
        threadData.originalContent,
        threadData.confidence,
        threadData.firstMessageAt,
        threadData.lastMessageAt
      );

      if (clusterResult.isNewCluster) {
        result.clusterCreated = true;
      } else {
        result.clusterUpdated = true;
      }

      logger.info(`Thread ${thread.id} processed successfully`, {
        question: threadData.extractedQuestion.substring(0, 100),
        clusterId: clusterResult.clusterId,
        isNewCluster: clusterResult.isNewCluster,
        similarity: clusterResult.similarity,
      });
    } catch (error) {
      logger.error(`Failed to process thread ${thread.id}`, error);
      throw error;
    }

    return result;
  }
}
