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
import { MlClientService } from '../services/MlClientService.js';
import { mlServiceConfig } from '../config/ml.js';
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
  private mlClient: MlClientService;

  constructor(db?: Kysely<Database>) {
    this.db = db || database;
    this.instanceRepo = new QuestionInstanceRepository(this.db);
    this.jobRepo = new AnalysisJobRepository(this.db);
    this.threadService = new ThreadProcessingService(this.db);
    this.clusteringService = new ClusteringService(this.db);
    this.mlClient = new MlClientService(mlServiceConfig);
  }

  /**
   * Start the worker
   */
  async start(): Promise<void> {
    const redis = new Redis(redisConfig);

    this.worker = new Worker<AnalysisJobData, AnalysisJobResult>(
      'thread-analysis',
      async (job: Job<AnalysisJobData>) => {
        // Handle different job types
        switch (job.name) {
          case 'analyze-threads':
            return this.processThreadAnalysisJob(job);
          case 'generate-golden-answer-embeddings':
            return this.processGoldenAnswerEmbeddingsJob(job);
          case 'generate-message-embeddings':
            return this.processMessageEmbeddingsJob(job);
          default:
            logger.warn(`Unknown job type: ${job.name}`);
            throw new Error(`Unknown job type: ${job.name}`);
        }
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
   * Process a thread analysis job
   */
  private async processThreadAnalysisJob(
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

  /**
   * Process golden answer embeddings generation job
   */
  private async processGoldenAnswerEmbeddingsJob(
    job: Job<AnalysisJobData>
  ): Promise<AnalysisJobResult> {
    const { tenantId } = job.data;
    
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
        job_type: 'golden_answer_embeddings',
        parameters: job.data,
      });

      // Update database job status
      await this.jobRepo.update(analysisJob.id, {
        status: 'processing',
        started_at: new Date().toISOString(),
      });

      // Fetch golden answers without embeddings
      const goldenAnswers = await this.db
        .selectFrom('golden_answers')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('embedding', 'is', null)
        .limit(100)
        .execute();

      const totalAnswers = goldenAnswers.length;
      logger.info(`Found ${totalAnswers} golden answers without embeddings for tenant ${tenantId}`);

      if (totalAnswers === 0) {
        // Update job as completed
        await this.jobRepo.update(analysisJob.id, {
          status: 'completed',
          completed_at: new Date().toISOString(),
          processed_items: 0,
          total_items: 0,
        });
        return result;
      }

      await job.updateProgress({
        stage: 'generating_embeddings',
        processed: 0,
        total: totalAnswers,
      });

      // Update database with total items
      await this.jobRepo.update(analysisJob.id, {
        total_items: totalAnswers,
      });

      // Process in batches of 10 for efficiency
      const batchSize = 10;
      for (let i = 0; i < goldenAnswers.length; i += batchSize) {
        const batch = goldenAnswers.slice(i, i + batchSize);
        
        try {
          // Extract answer texts
          const texts = batch.map(ga => ga.answer);
          
          // Generate embeddings using the ML service
          const embeddings = await this.mlClient.embedBatch(texts);
          
          // Validate embeddings response
          if (!embeddings || !Array.isArray(embeddings)) {
            throw new Error(`Invalid embeddings response: expected array, got ${typeof embeddings}`);
          }
          
          if (embeddings.length !== batch.length) {
            throw new Error(`Embeddings count mismatch: expected ${batch.length}, got ${embeddings.length}`);
          }
          
          // Update golden answers with embeddings
          for (let j = 0; j < batch.length; j++) {
            const goldenAnswer = batch[j];
            const embeddingResult = embeddings[j];
            
            if (!embeddingResult || !embeddingResult.embedding) {
              logger.error(`Invalid embedding result at index ${j}`, { embeddingResult });
              throw new Error(`Missing embedding for index ${j}`);
            }
            
            const embedding = embeddingResult.embedding;
            
            // Convert embedding array to JSON string for TiDB vector storage
            const embeddingJson = `[${embedding.join(',')}]`;
            
            await this.db
              .updateTable('golden_answers')
              .set({ embedding: embeddingJson as any })
              .where('id', '=', goldenAnswer.id)
              .execute();
          }

          result.questionsExtracted += batch.length; // Reusing this field for embeddings generated

          // Update progress
          await job.updateProgress({
            stage: 'generating_embeddings',
            processed: Math.min(i + batchSize, totalAnswers),
            total: totalAnswers,
          });

          // Update database progress periodically
          if ((i + batchSize) % 20 === 0 || i + batchSize >= totalAnswers) {
            await this.jobRepo.update(analysisJob.id, {
              processed_items: Math.min(i + batchSize, totalAnswers),
            });
          }
        } catch (error: any) {
          logger.error(`Failed to process golden answer batch`, error);
          result.errors.push({
            threadId: `batch_${i}`,
            error: error.message,
          });
        }
      }

      // Update analysis job as completed
      await this.jobRepo.update(analysisJob.id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        processed_items: result.questionsExtracted,
        total_items: totalAnswers,
      });

      logger.info('Golden answer embeddings job completed', result);
      return result;
    } catch (error: any) {
      logger.error('Golden answer embeddings job failed', error);
      throw error;
    }
  }

  /**
   * Process message embeddings generation job
   */
  private async processMessageEmbeddingsJob(
    job: Job<AnalysisJobData>
  ): Promise<AnalysisJobResult> {
    const { tenantId, channelIds } = job.data;
    
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
        job_type: 'message_embeddings',
        parameters: job.data,
      });

      // Update database job status
      await this.jobRepo.update(analysisJob.id, {
        status: 'processing',
        started_at: new Date().toISOString(),
      });

      // Build query for messages without embeddings
      let query = this.db
        .selectFrom('messages')
        .selectAll()
        .where('embedding', 'is', null)
        .where('content', '!=', '')
        .where('content', 'is not', null)
        .limit(100);

      // If channelIds provided, filter by channels
      if (channelIds && channelIds.length > 0) {
        query = query.where('channel_id', 'in', channelIds);
      } else {
        // Otherwise, filter by tenant's channels
        const channels = await this.db
          .selectFrom('channels')
          .select('id')
          .where('tenant_id', '=', tenantId)
          .execute();
        
        const channelIdList = channels.map(c => c.id);
        if (channelIdList.length > 0) {
          query = query.where('channel_id', 'in', channelIdList);
        } else {
          // No channels for this tenant
          await this.jobRepo.update(analysisJob.id, {
            status: 'completed',
            completed_at: new Date().toISOString(),
            processed_items: 0,
            total_items: 0,
          });
          return result;
        }
      }

      const messages = await query.execute();

      const totalMessages = messages.length;
      logger.info(`Found ${totalMessages} messages without embeddings for tenant ${tenantId}`);

      if (totalMessages === 0) {
        // Update job as completed
        await this.jobRepo.update(analysisJob.id, {
          status: 'completed',
          completed_at: new Date().toISOString(),
          processed_items: 0,
          total_items: 0,
        });
        return result;
      }

      await job.updateProgress({
        stage: 'generating_embeddings',
        processed: 0,
        total: totalMessages,
      });

      // Update database with total items
      await this.jobRepo.update(analysisJob.id, {
        total_items: totalMessages,
      });

      // Process in batches of 10 for efficiency
      const batchSize = 10;
      let processedCount = 0;
      
      for (let i = 0; i < messages.length; i += batchSize) {
        const batch = messages.slice(i, i + batchSize);
        
        try {
          // Filter out messages with empty content
          const messagesWithContent = batch.filter(m => m.content && m.content.trim() !== '');
          
          // Skip batch if all messages have empty content
          if (messagesWithContent.length === 0) {
            logger.debug(`Skipping batch ${i} - all messages have empty content`);
            continue;
          }
          
          // Extract texts only from messages with content
          const texts = messagesWithContent.map(m => m.content!);
          
          // Generate embeddings using the ML service
          const embeddings = await this.mlClient.embedBatch(texts);
          
          // Validate embeddings response
          if (!embeddings || !Array.isArray(embeddings)) {
            throw new Error(`Invalid embeddings response: expected array, got ${typeof embeddings}`);
          }
          
          if (embeddings.length !== messagesWithContent.length) {
            throw new Error(`Embeddings count mismatch: expected ${messagesWithContent.length}, got ${embeddings.length}`);
          }
          
          // Update messages with embeddings
          for (let j = 0; j < messagesWithContent.length; j++) {
            const message = messagesWithContent[j];
            const embeddingResult = embeddings[j];
            
            if (!embeddingResult || !embeddingResult.embedding) {
              logger.error(`Invalid embedding result at index ${j}`, { embeddingResult });
              throw new Error(`Missing embedding for index ${j}`);
            }
            
            const embedding = embeddingResult.embedding;
            
            // Convert embedding array to JSON string for TiDB vector storage
            const embeddingJson = `[${embedding.join(',')}]`;
            
            await this.db
              .updateTable('messages')
              .set({ embedding: embeddingJson as any })
              .where('id', '=', message.id)
              .execute();
              
            processedCount++;
          }

          result.questionsExtracted = processedCount; // Reusing this field for embeddings generated

          // Update progress
          await job.updateProgress({
            stage: 'generating_embeddings',
            processed: Math.min(i + batchSize, totalMessages),
            total: totalMessages,
          });

          // Update database progress periodically
          if ((i + batchSize) % 20 === 0 || i + batchSize >= totalMessages) {
            await this.jobRepo.update(analysisJob.id, {
              processed_items: processedCount,
            });
          }
        } catch (error: any) {
          logger.error(`Failed to process message batch`, error);
          result.errors.push({
            threadId: `batch_${i}`,
            error: error.message,
          });
        }
      }

      // Update analysis job as completed
      await this.jobRepo.update(analysisJob.id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        processed_items: processedCount,
        total_items: totalMessages,
      });

      logger.info('Message embeddings job completed', result);
      return result;
    } catch (error: any) {
      logger.error('Message embeddings job failed', error);
      throw error;
    }
  }
}
