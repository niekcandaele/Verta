#!/usr/bin/env tsx

/**
 * Script to add multiple message embedding jobs to the queue
 * This will process all messages without embeddings
 */

import { addMessageEmbeddingJob } from '../queues/analysisQueue.js';
import logger from '../utils/logger.js';

const TENANT_ID = 'dcc3a375-90d8-40dd-8761-2d622936c90b'; // Takaro tenant
const MESSAGES_WITHOUT_EMBEDDINGS = 250067;
const MESSAGES_PER_JOB = 100;
const TOTAL_JOBS_NEEDED = Math.ceil(MESSAGES_WITHOUT_EMBEDDINGS / MESSAGES_PER_JOB);
const BATCH_SIZE = 100; // Add jobs in batches
const DELAY_BETWEEN_BATCHES = 1000; // 1 second delay between batches

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  logger.info(`Starting bulk job creation for ${TOTAL_JOBS_NEEDED} jobs`);
  logger.info(`This will process approximately ${MESSAGES_WITHOUT_EMBEDDINGS} messages`);

  let jobsCreated = 0;
  const jobIds: string[] = [];

  try {
    for (let i = 0; i < TOTAL_JOBS_NEEDED; i += BATCH_SIZE) {
      const batchSize = Math.min(BATCH_SIZE, TOTAL_JOBS_NEEDED - i);
      logger.info(`Creating batch of ${batchSize} jobs (${i + 1} to ${i + batchSize} of ${TOTAL_JOBS_NEEDED})`);

      const batchPromises: Promise<string>[] = [];
      
      for (let j = 0; j < batchSize; j++) {
        const jobIndex = i + j;
        if (jobIndex >= TOTAL_JOBS_NEEDED) break;

        // Add job with a slight delay to spread them out
        const delayMs = j * 100; // 100ms between each job in the batch
        
        const promise = addMessageEmbeddingJob(
          { tenantId: TENANT_ID },
          { delay: delayMs }
        ).then(jobId => {
          jobsCreated++;
          if (jobsCreated % 100 === 0) {
            logger.info(`Progress: ${jobsCreated}/${TOTAL_JOBS_NEEDED} jobs created`);
          }
          return jobId;
        });

        batchPromises.push(promise);
      }

      // Wait for all jobs in this batch to be created
      const batchJobIds = await Promise.all(batchPromises);
      jobIds.push(...batchJobIds);

      // Add delay between batches to avoid overwhelming the system
      if (i + BATCH_SIZE < TOTAL_JOBS_NEEDED) {
        logger.info(`Waiting ${DELAY_BETWEEN_BATCHES}ms before next batch...`);
        await sleep(DELAY_BETWEEN_BATCHES);
      }
    }

    logger.info(`Successfully created ${jobsCreated} jobs`);
    logger.info(`First job ID: ${jobIds[0]}`);
    logger.info(`Last job ID: ${jobIds[jobIds.length - 1]}`);
    logger.info('Jobs will be processed by the analysis worker');
    logger.info('Monitor progress in the BullMQ dashboard or logs');

    process.exit(0);
  } catch (error) {
    logger.error('Failed to create jobs', error);
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  logger.error('Script failed', error);
  process.exit(1);
});