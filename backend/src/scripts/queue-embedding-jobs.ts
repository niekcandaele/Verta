#!/usr/bin/env tsx

/**
 * Script to queue multiple message embedding generation jobs
 * This helps process the backlog of messages without embeddings faster
 */

import { addMessageEmbeddingJob } from '../queues/analysisQueue.js';
import { closeAnalysisQueue } from '../queues/analysisQueue.js';
import logger from '../utils/logger.js';

const TAKARO_TENANT_ID = 'dcc3a375-90d8-40dd-8761-2d622936c90b';
const NUMBER_OF_JOBS = 25; // Queue 25 jobs (processing 2,500 messages)

async function queueEmbeddingJobs() {
  try {
    logger.info(`Starting to queue ${NUMBER_OF_JOBS} message embedding jobs for Takaro tenant`);
    
    const jobIds: string[] = [];
    
    for (let i = 0; i < NUMBER_OF_JOBS; i++) {
      try {
        // Add a small delay between job additions to avoid overwhelming the queue
        if (i > 0 && i % 5 === 0) {
          logger.info(`Queued ${i} jobs so far, waiting 1 second before continuing...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        const jobId = await addMessageEmbeddingJob({
          tenantId: TAKARO_TENANT_ID,
        });
        
        jobIds.push(jobId);
        logger.info(`Queued job ${i + 1}/${NUMBER_OF_JOBS} with ID: ${jobId}`);
      } catch (error) {
        logger.error(`Failed to queue job ${i + 1}`, { error });
      }
    }
    
    logger.info(`Successfully queued ${jobIds.length} message embedding jobs`);
    logger.info('Job IDs:', jobIds);
    
    // Close the queue connection
    await closeAnalysisQueue();
    
    logger.info('Script completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Script failed', { error });
    process.exit(1);
  }
}

// Run the script
queueEmbeddingJobs();