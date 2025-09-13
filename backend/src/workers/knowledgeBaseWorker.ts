import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { redisConfig } from '../config/redis.js';
import { 
  KnowledgeBaseCrawlJobData, 
  KnowledgeBaseCrawlJobResult,
  KnowledgeBaseSitemapJobData,
  KnowledgeBaseSitemapJobResult,
  KnowledgeBaseUrlJobData,
  KnowledgeBaseUrlJobResult,
  KnowledgeBaseJobData,
  KnowledgeBaseJobResult,
  addKnowledgeBaseUrlJobsBatch
} from '../queues/knowledgeBaseQueue.js';
import type { Kysely } from 'kysely';
import type { Database } from '../database/types.js';
import { KnowledgeBaseRepositoryImpl } from '../repositories/knowledgeBase/KnowledgeBaseRepository.js';
import { 
  SitemapFetcher,
  ContentExtractor,
  SemanticChunker,
  type SitemapUrl,
  type ExtractedContent,
  type SemanticChunk
} from '../services/knowledgeBase/index.js';
import { MlClientService } from '../services/MlClientService.js';
import { mlServiceConfig } from '../config/ml.js';
import logger from '../utils/logger.js';

/**
 * Knowledge Base Worker for processing sitemap crawling jobs
 */
export class KnowledgeBaseWorker {
  private worker: Worker<KnowledgeBaseJobData, KnowledgeBaseJobResult> | null = null;
  private knowledgeBaseRepository: KnowledgeBaseRepositoryImpl;
  private sitemapFetcher: SitemapFetcher;
  private contentExtractor: ContentExtractor;
  private semanticChunker: SemanticChunker;
  private mlClient: MlClientService;

  constructor(db: Kysely<Database>) {
    this.knowledgeBaseRepository = new KnowledgeBaseRepositoryImpl(db);
    this.sitemapFetcher = new SitemapFetcher();
    this.contentExtractor = new ContentExtractor();
    this.semanticChunker = new SemanticChunker();
    this.mlClient = new MlClientService(mlServiceConfig);
  }

  /**
   * Start the knowledge base worker
   */
  async start(): Promise<void> {
    if (this.worker) {
      logger.warn('Knowledge base worker already started');
      return;
    }

    const redis = new Redis(redisConfig);

    this.worker = new Worker<KnowledgeBaseJobData, KnowledgeBaseJobResult>(
      'knowledge-base-crawl',
      async (job: Job<KnowledgeBaseJobData>) => {
        // Handle different job types
        switch (job.name) {
          case 'weekly-crawl-all-knowledge-bases': {
            // Import the scheduler here to avoid circular dependencies
            const { getKnowledgeBaseScheduler } = await import('../scheduler/knowledgeBaseScheduler.js');
            const scheduler = getKnowledgeBaseScheduler();
            return await scheduler.processWeeklyCrawl(job as Job<KnowledgeBaseCrawlJobData>);
          }
          
          case 'crawl-knowledge-base':
            // Legacy full crawl job - still supported for backward compatibility
            return this.processCrawlJob(job as Job<KnowledgeBaseCrawlJobData>);
          
          case 'process-sitemap':
            // New sitemap processing job
            return this.processSitemapJob(job as Job<KnowledgeBaseSitemapJobData>);
          
          case 'process-url':
            // New URL processing job
            return this.processUrlJob(job as Job<KnowledgeBaseUrlJobData>);
          
          default:
            throw new Error(`Unknown job type: ${job.name}`);
        }
      },
      {
        connection: redis,
        concurrency: 3, // Allow 3 concurrent jobs for better parallelization of URL processing
        maxStalledCount: 2,
        stalledInterval: 600000, // 10 minutes for web crawling
      }
    );

    // Set up event handlers
    this.worker.on('completed', (job) => {
      logger.info('Knowledge base crawl job completed', {
        jobId: job.id,
        knowledgeBaseId: job.data.knowledgeBaseId,
        result: job.returnvalue,
      });
    });

    this.worker.on('failed', (job, err) => {
      logger.error('Knowledge base crawl job failed', {
        jobId: job?.id,
        knowledgeBaseId: job?.data.knowledgeBaseId,
        error: err.message,
        attempts: job?.attemptsMade,
      });
    });

    this.worker.on('stalled', (jobId) => {
      logger.warn('Knowledge base crawl job stalled', { jobId });
    });

    logger.info('Knowledge base worker started');
  }

  /**
   * Process a sitemap job - fetches sitemap and creates URL jobs
   */
  private async processSitemapJob(
    job: Job<KnowledgeBaseSitemapJobData>
  ): Promise<KnowledgeBaseSitemapJobResult> {
    const startTime = Date.now();
    const {
      knowledgeBaseId,
      tenantId,
      sitemapUrl,
      name,
      isInitialCrawl,
    } = job.data;

    logger.info('Processing knowledge base sitemap job', {
      jobId: job.id,
      knowledgeBaseId,
      tenantId,
      sitemapUrl,
      name,
      isInitialCrawl,
    });

    const errors: string[] = [];

    try {

      // Fetch and parse sitemap
      logger.info('Fetching sitemap', { sitemapUrl, knowledgeBaseId });
      const sitemapResult = await this.sitemapFetcher.fetchSitemap(sitemapUrl);
      
      if (!sitemapResult.success) {
        errors.push(...sitemapResult.errors);
        throw new Error(`Failed to fetch sitemap: ${sitemapResult.errors.join(', ')}`);
      }

      const { urls } = sitemapResult;
      logger.info('Sitemap fetched successfully', {
        urlCount: urls.length,
        knowledgeBaseId,
      });

      await job.updateProgress(20);

      // Create URL jobs for each URL in the sitemap
      const urlJobs = urls.map((urlData, index) => ({
        data: {
          knowledgeBaseId,
          tenantId,
          url: urlData.loc,
          urlMetadata: {
            lastmod: urlData.lastmod,
            changefreq: urlData.changefreq,
            priority: urlData.priority,
          },
          isInitialCrawl,
          sitemapJobId: job.id!,
          urlIndex: index,
          totalUrls: urls.length,
        } as KnowledgeBaseUrlJobData,
        options: {
          // Stagger URL jobs to avoid overwhelming the target server
          delay: Math.floor(index / 10) * 2000, // Process 10 URLs every 2 seconds
          priority: isInitialCrawl ? 5 : 3,
        },
      }));

      // Queue all URL jobs in batches
      const batchSize = 100;
      let queuedCount = 0;
      
      for (let i = 0; i < urlJobs.length; i += batchSize) {
        const batch = urlJobs.slice(i, i + batchSize);
        await addKnowledgeBaseUrlJobsBatch(batch);
        queuedCount += batch.length;
        
        // Update progress
        const progress = 20 + (60 * queuedCount / urlJobs.length);
        await job.updateProgress(progress);
      }

      await job.updateProgress(90);

      const processingTime = Date.now() - startTime;
      
      logger.info('Sitemap job completed successfully', {
        jobId: job.id,
        knowledgeBaseId,
        urlsQueued: queuedCount,
        processingTimeMs: processingTime,
      });

      return {
        success: true,
        knowledgeBaseId,
        urlsQueued: queuedCount,
        errors,
        processingTimeMs: processingTime,
        sitemapUrl,
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Sitemap job processing failed', {
        jobId: job.id,
        knowledgeBaseId,
        error: errorMessage,
        processingTimeMs: processingTime,
      });


      return {
        success: false,
        knowledgeBaseId,
        urlsQueued: 0,
        errors: [errorMessage],
        processingTimeMs: processingTime,
        sitemapUrl,
      };
    }
  }

  /**
   * Process a single crawl job
   */
  private async processCrawlJob(
    job: Job<KnowledgeBaseCrawlJobData>
  ): Promise<KnowledgeBaseCrawlJobResult> {
    const startTime = Date.now();
    const {
      knowledgeBaseId,
      tenantId,
      sitemapUrl,
      name,
      isInitialCrawl,
      attempt = 1,
    } = job.data;

    logger.info('Processing knowledge base crawl job', {
      jobId: job.id,
      knowledgeBaseId,
      tenantId,
      sitemapUrl,
      name,
      isInitialCrawl,
      attempt,
    });

    try {

      // Update job progress
      await job.updateProgress(10);

      // Phase 5: Real sitemap crawling and content processing
      const crawlResult = await this.crawlSitemap(
        knowledgeBaseId,
        tenantId,
        sitemapUrl,
        isInitialCrawl,
        job
      );

      const { urlsProcessed, chunksCreated, chunksUpdated, errors } = crawlResult;

      // Update last crawled time
      const lastCrawledAt = new Date().toISOString();
      await this.knowledgeBaseRepository.update(knowledgeBaseId, {
        last_crawled_at: lastCrawledAt
      });

      await job.updateProgress(100);

      const processingTime = Date.now() - startTime;
      
      logger.info('Knowledge base crawl job completed successfully (mock)', {
        jobId: job.id,
        knowledgeBaseId,
        urlsProcessed,
        chunksCreated,
        chunksUpdated,
        processingTimeMs: processingTime,
      });

      return {
        success: true,
        knowledgeBaseId,
        urlsProcessed,
        chunksCreated,
        chunksUpdated,
        errors,
        processingTimeMs: processingTime,
        lastCrawledAt,
        status: 'completed' as const,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Knowledge base crawl processing failed', {
        jobId: job.id,
        knowledgeBaseId,
        error: errorMessage,
        attempt,
        processingTimeMs: processingTime,
      });


      // Return failure result
      return {
        success: false,
        knowledgeBaseId,
        urlsProcessed: 0,
        chunksCreated: 0,
        chunksUpdated: 0,
        errors: [errorMessage],
        processingTimeMs: processingTime,
        lastCrawledAt: new Date().toISOString(),
        status: 'failed' as const,
      };
    }
  }

  /**
   * Crawl sitemap and process all URLs with content extraction, chunking, and embeddings
   */
  private async crawlSitemap(
    knowledgeBaseId: string,
    tenantId: string,
    sitemapUrl: string,
    isInitialCrawl: boolean,
    job: Job<KnowledgeBaseCrawlJobData>
  ): Promise<{
    urlsProcessed: number;
    chunksCreated: number;
    chunksUpdated: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let urlsProcessed = 0;
    let chunksCreated = 0;
    let chunksUpdated = 0;

    try {
      // Step 1: Fetch and parse sitemap
      logger.info('Fetching sitemap', { sitemapUrl, knowledgeBaseId });
      const sitemapResult = await this.sitemapFetcher.fetchSitemap(sitemapUrl);
      
      if (!sitemapResult.success) {
        errors.push(...sitemapResult.errors);
        return { urlsProcessed, chunksCreated, chunksUpdated, errors };
      }

      const { urls } = sitemapResult;
      logger.info('Sitemap fetched successfully', {
        urlCount: urls.length,
        knowledgeBaseId,
      });

      await job.updateProgress(20);

      // Step 2: Process each URL with rate limiting
      const maxConcurrent = 3; // Process up to 3 URLs concurrently
      const batchSize = 10; // Process in batches to avoid memory issues
      
      for (let i = 0; i < urls.length; i += batchSize) {
        const urlBatch = urls.slice(i, i + batchSize);
        
        // Process batch with proper concurrency control
        // Process URLs in chunks of maxConcurrent within each batch
        for (let j = 0; j < urlBatch.length; j += maxConcurrent) {
          const concurrentChunk = urlBatch.slice(j, j + maxConcurrent);
          
          const chunkPromises = concurrentChunk.map(async (urlData) => {
            return this.processUrl(urlData, knowledgeBaseId, tenantId, isInitialCrawl);
          });
          
          const chunkResults = await Promise.allSettled(chunkPromises);
          
          // Collect results
          chunkResults.forEach((result, chunkIndex) => {
            if (result.status === 'fulfilled') {
              const { processed, created, updated } = result.value;
              if (processed) urlsProcessed++;
              chunksCreated += created;
              chunksUpdated += updated;
            } else {
              const url = concurrentChunk[chunkIndex]?.loc || 'unknown';
              errors.push(`Failed to process ${url}: ${result.reason}`);
            }
          });
        }

        // Update progress
        const progress = Math.min(20 + (60 * (i + batchSize)) / urls.length, 80);
        await job.updateProgress(progress);

        // Rate limiting: wait between batches
        if (i + batchSize < urls.length) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second between batches
        }
      }

      await job.updateProgress(90);

      logger.info('Sitemap crawling completed', {
        knowledgeBaseId,
        urlsProcessed,
        chunksCreated,
        chunksUpdated,
        errorCount: errors.length,
      });

      return { urlsProcessed, chunksCreated, chunksUpdated, errors };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Sitemap crawling failed', {
        knowledgeBaseId,
        sitemapUrl,
        error: errorMessage,
      });
      errors.push(`Sitemap crawling failed: ${errorMessage}`);
      return { urlsProcessed, chunksCreated, chunksUpdated, errors };
    }
  }

  /**
   * Process a URL job - processes a single URL from a sitemap
   */
  private async processUrlJob(
    job: Job<KnowledgeBaseUrlJobData>
  ): Promise<KnowledgeBaseUrlJobResult> {
    const startTime = Date.now();
    const {
      knowledgeBaseId,
      tenantId,
      url,
      urlMetadata,
      isInitialCrawl,
      sitemapJobId,
      urlIndex,
      totalUrls,
    } = job.data;

    logger.info('Processing knowledge base URL job', {
      jobId: job.id,
      knowledgeBaseId,
      url,
      urlIndex,
      totalUrls,
      sitemapJobId,
    });

    try {
      // Process the URL using existing logic
      const result = await this.processUrl(
        { 
          loc: url, 
          lastmod: urlMetadata?.lastmod,
          changefreq: urlMetadata?.changefreq as SitemapUrl['changefreq'],
          priority: urlMetadata?.priority,
        },
        knowledgeBaseId,
        tenantId,
        isInitialCrawl
      );

      const processingTime = Date.now() - startTime;

      // Update last_crawl_event for any activity
      await this.knowledgeBaseRepository.update(knowledgeBaseId, {
        last_crawl_event: new Date().toISOString(),
      });

      if (result.processed) {
        logger.debug('URL job completed successfully', {
          jobId: job.id,
          url,
          chunksCreated: result.created,
          chunksUpdated: result.updated,
          processingTimeMs: processingTime,
        });

        return {
          success: true,
          knowledgeBaseId,
          url,
          chunksCreated: result.created,
          chunksUpdated: result.updated,
          processingTimeMs: processingTime,
        };
      } else {
        return {
          success: false,
          knowledgeBaseId,
          url,
          chunksCreated: 0,
          chunksUpdated: 0,
          error: 'Failed to process URL',
          processingTimeMs: processingTime,
        };
      }

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Update last_crawl_event even for errors
      await this.knowledgeBaseRepository.update(knowledgeBaseId, {
        last_crawl_event: new Date().toISOString(),
      });

      logger.error('URL job processing failed', {
        jobId: job.id,
        url,
        knowledgeBaseId,
        error: errorMessage,
        processingTimeMs: processingTime,
      });

      return {
        success: false,
        knowledgeBaseId,
        url,
        chunksCreated: 0,
        chunksUpdated: 0,
        error: errorMessage,
        processingTimeMs: processingTime,
      };
    }
  }

  /**
   * Process a single URL: extract content, chunk, generate embeddings, and store
   */
  private async processUrl(
    urlData: SitemapUrl,
    knowledgeBaseId: string,
    _tenantId: string,
    isInitialCrawl: boolean
  ): Promise<{
    processed: boolean;
    created: number;
    updated: number;
  }> {
    const { loc: url } = urlData;
    
    try {
      logger.debug('Processing URL', { url, knowledgeBaseId });

      // Step 1: Extract content from URL
      const contentResult = await this.contentExtractor.extractFromUrl(url);
      
      if (!contentResult.success || !contentResult.content) {
        logger.warn('Failed to extract content from URL', {
          url,
          error: contentResult.error,
        });
        return { processed: false, created: 0, updated: 0 };
      }

      const extractedContent = contentResult.content;

      // Step 2: Check if content changed (for re-crawls)
      if (!isInitialCrawl) {
        const hasChanged = await this.hasContentChanged(
          knowledgeBaseId,
          url,
          extractedContent.metadata.checksum
        );
        
        if (!hasChanged) {
          logger.debug('Content unchanged, skipping', { url });
          return { processed: true, created: 0, updated: 0 };
        }
      }

      // Step 3: Semantic chunking
      const chunkingResult = await this.semanticChunker.chunkContent(extractedContent);
      const { chunks } = chunkingResult;

      if (chunks.length === 0) {
        logger.warn('No chunks generated from content', { url });
        return { processed: true, created: 0, updated: 0 };
      }

      // Step 4: Generate embeddings for chunks
      const chunksWithEmbeddings = await this.generateEmbeddingsForChunks(chunks);

      // Step 5: Store chunks in database
      const { created, updated } = await this.storeChunks(
        chunksWithEmbeddings,
        knowledgeBaseId,
        url,
        extractedContent,
        isInitialCrawl
      );

      logger.debug('URL processed successfully', {
        url,
        chunkCount: chunks.length,
        created,
        updated,
      });

      return { processed: true, created, updated };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to process URL', {
        url,
        knowledgeBaseId,
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Check if content has changed by comparing checksums
   */
  private async hasContentChanged(
    knowledgeBaseId: string,
    url: string,
    newChecksum: string
  ): Promise<boolean> {
    try {
      // Get existing chunks for this URL to compare checksum
      const existingChunks = await this.knowledgeBaseRepository.getChunksByUrl(
        knowledgeBaseId,
        url
      );

      if (existingChunks.length === 0) {
        return true; // No existing content, so it's changed
      }

      // Compare with first chunk's checksum (all chunks from same URL have same checksum)
      const existingChecksum = existingChunks[0].checksum;
      return existingChecksum !== newChecksum;

    } catch (error) {
      logger.warn('Failed to check content changes, assuming changed', {
        knowledgeBaseId,
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      return true; // Assume changed if we can't check
    }
  }

  /**
   * Generate embeddings for chunks
   */
  private async generateEmbeddingsForChunks(
    chunks: SemanticChunk[]
  ): Promise<Array<SemanticChunk & { embedding: number[] }>> {
    try {
      const BATCH_SIZE = 3; // Process 3 chunks at a time to avoid overloading CPU-only ML service
      const chunksWithEmbeddings: Array<SemanticChunk & { embedding: number[] }> = [];
      
      // Process chunks in smaller batches
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        const batchTexts = batch.map(chunk => chunk.content);
        
        logger.debug('Processing embedding batch', {
          batchNumber: Math.floor(i / BATCH_SIZE) + 1,
          totalBatches: Math.ceil(chunks.length / BATCH_SIZE),
          batchSize: batch.length,
        });
        
        // Generate embeddings for this batch
        const embeddingResults = await this.mlClient.embedBatch(batchTexts);
        
        // Combine chunks with embeddings
        const batchWithEmbeddings = batch.map((chunk, index) => ({
          ...chunk,
          embedding: embeddingResults[index].embedding,
        }));
        
        chunksWithEmbeddings.push(...batchWithEmbeddings);
      }
      
      return chunksWithEmbeddings;

    } catch (error) {
      logger.error('Failed to generate embeddings for chunks', {
        chunkCount: chunks.length,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Store chunks with embeddings in database
   */
  private async storeChunks(
    chunksWithEmbeddings: Array<SemanticChunk & { embedding: number[] }>,
    knowledgeBaseId: string,
    sourceUrl: string,
    extractedContent: ExtractedContent,
    isInitialCrawl: boolean
  ): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;

    try {
      // If not initial crawl, remove existing chunks for this URL
      if (!isInitialCrawl) {
        const deletedCount = await this.knowledgeBaseRepository.deleteChunksByUrl(
          knowledgeBaseId,
          sourceUrl
        );
        logger.debug('Deleted existing chunks', { 
          sourceUrl, 
          deletedCount,
          knowledgeBaseId 
        });
      }

      // Insert new chunks
      for (let i = 0; i < chunksWithEmbeddings.length; i++) {
        const chunkWithEmbedding = chunksWithEmbeddings[i];
        const { content, metadata, embedding } = chunkWithEmbedding;

        const chunkData = {
          knowledge_base_id: knowledgeBaseId,
          source_url: sourceUrl,
          title: extractedContent.title,
          heading_hierarchy: metadata.headingHierarchy, // TiDB JSON column expects object, not string
          content,
          embedding: `[${embedding.join(',')}]`, // Store as JSON string for TiDB
          chunk_index: metadata.chunkIndex,
          total_chunks: metadata.totalChunks,
          start_char_index: metadata.startCharIndex,
          end_char_index: metadata.endCharIndex,
          overlap_with_previous: metadata.overlapWithPrevious,
          checksum: extractedContent.metadata.checksum,
          chunk_method: metadata.chunkMethod,
          token_count: metadata.tokenCount,
        };

        await this.knowledgeBaseRepository.createChunk(chunkData);
        
        if (isInitialCrawl) {
          created++;
        } else {
          updated++;
        }
      }

      logger.debug('Chunks stored successfully', {
        sourceUrl,
        chunkCount: chunksWithEmbeddings.length,
        created,
        updated,
      });

      return { created, updated };

    } catch (error) {
      logger.error('Failed to store chunks', {
        sourceUrl,
        knowledgeBaseId,
        chunkCount: chunksWithEmbeddings.length,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Stop the knowledge base worker
   */
  async stop(): Promise<void> {
    if (!this.worker) {
      logger.warn('Knowledge base worker not running');
      return;
    }

    await this.worker.close();
    this.worker = null;
    logger.info('Knowledge base worker stopped');
  }

  /**
   * Get worker status
   */
  isRunning(): boolean {
    return this.worker !== null;
  }

}