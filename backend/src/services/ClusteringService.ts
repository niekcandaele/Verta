import { Kysely } from 'kysely';
import { Database } from '../database/types.js';
import { QuestionClusterRepository } from '../repositories/QuestionClusterRepository.js';
import { QuestionInstanceRepository } from '../repositories/QuestionInstanceRepository.js';
import { MlClientService } from './MlClientService.js';
import { mlConfig } from '../config/ml.js';
import logger from '../utils/logger.js';

/**
 * Service for clustering similar questions
 */
export class ClusteringService {
  private clusterRepo: QuestionClusterRepository;
  private instanceRepo: QuestionInstanceRepository;
  private mlClient: MlClientService;

  constructor(db: Kysely<Database>) {
    this.clusterRepo = new QuestionClusterRepository(db);
    this.instanceRepo = new QuestionInstanceRepository(db);
    this.mlClient = new MlClientService({
      baseUrl: mlConfig.mlServiceUrl,
      apiKey: mlConfig.mlServiceApiKey,
      timeout: mlConfig.mlServiceTimeout,
      maxRetries: mlConfig.mlServiceMaxRetries,
      retryDelay: mlConfig.mlServiceRetryDelay,
    });
  }

  /**
   * Process a question and either add it to an existing cluster or create a new one
   * @param tenantId The tenant ID
   * @param threadId The thread ID
   * @param threadTitle Optional thread title
   * @param question The extracted question text
   * @param originalContent The original thread content
   * @param confidence The confidence score for the question
   * @param firstMessageAt The timestamp of the first message in the thread
   * @param lastMessageAt The timestamp of the last message in the thread
   * @returns The cluster ID and whether it was newly created
   */
  async clusterQuestion(
    tenantId: string,
    threadId: string,
    threadTitle: string | null,
    question: string,
    originalContent: string,
    confidence: number,
    firstMessageAt: Date,
    lastMessageAt: Date
  ): Promise<{
    clusterId: string;
    isNewCluster: boolean;
    similarity?: number;
  }> {
    try {
      // Generate embedding for the question
      const embedding = await this.mlClient.embed(question);

      // Try two-stage clustering for better matches
      // First: Try high similarity for exact matches (0.85)
      let similarCluster = await this.clusterRepo.findMostSimilarCluster(
        embedding.embedding,
        tenantId,
        0.85 // High threshold for very similar questions
      );

      // Second: If no exact match, try broader similarity
      if (!similarCluster) {
        similarCluster = await this.clusterRepo.findMostSimilarCluster(
          embedding.embedding,
          tenantId,
          mlConfig.clusterSimilarityThreshold // Lower threshold (0.70 by default)
        );
      }

      let clusterId: string;
      let isNewCluster: boolean;
      let similarity: number | undefined;

      if (similarCluster) {
        // Add to existing cluster
        clusterId = similarCluster.id;
        isNewCluster = false;
        similarity = similarCluster.similarity;

        logger.info(
          `Adding question to existing cluster ${clusterId} with similarity ${similarity}`
        );

        // Update cluster statistics with the actual message date
        await this.clusterRepo.incrementInstanceCount(clusterId, lastMessageAt);

        // Optionally update representative text if this question is better
        // (This could be based on confidence, length, clarity, etc.)
        if (confidence > 0.9) {
          await this.clusterRepo.update(clusterId, {
            representative_text: question,
            thread_title: threadTitle || undefined,
          });
        }
      } else {
        // Create new cluster with actual message dates
        const newCluster = await this.clusterRepo.create({
          tenant_id: tenantId,
          representative_text: question,
          thread_title: threadTitle,
          embedding: embedding.embedding,
          instance_count: 1,
          first_seen_at: firstMessageAt.toISOString(),
          last_seen_at: lastMessageAt.toISOString(),
          metadata: {
            source: 'thread_analysis',
            confidence,
          },
        });

        clusterId = newCluster.id;
        isNewCluster = true;

        logger.info(
          `Created new cluster ${clusterId} for question: ${question.substring(0, 100)}...`
        );
      }

      // Create question instance
      // Use similarity score for existing clusters, confidence for new clusters
      await this.instanceRepo.create({
        cluster_id: clusterId,
        thread_id: threadId,
        thread_title: threadTitle,
        original_text: originalContent,
        rephrased_text: question,
        confidence_score: similarity !== undefined ? similarity : confidence,
      });

      return {
        clusterId,
        isNewCluster,
        similarity,
      };
    } catch (error) {
      logger.error('Failed to cluster question', { error, threadId, question });
      throw error;
    }
  }

  /**
   * Get cluster statistics for a tenant
   */
  async getClusterStats(tenantId: string) {
    return this.clusterRepo.getStatsByTenant(tenantId);
  }

  /**
   * Get top clusters by instance count
   */
  async getTopClusters(tenantId: string, limit: number = 10) {
    return this.clusterRepo.findByTenant(tenantId, {
      limit,
      sortBy: 'instance_count',
      sortOrder: 'desc',
    });
  }

  /**
   * Merge two clusters together
   * Used when clusters are found to be duplicates
   */
  async mergeClusters(
    sourceClusterId: string,
    targetClusterId: string
  ): Promise<void> {
    // Get all instances from source cluster
    const sourceInstances =
      await this.instanceRepo.findByClusterId(sourceClusterId);

    // Update all instances to point to target cluster
    for (const instance of sourceInstances) {
      await this.instanceRepo.update(instance.id, {
        cluster_id: targetClusterId,
      });
    }

    // Update target cluster statistics
    const targetCluster = await this.clusterRepo.findById(targetClusterId);
    if (targetCluster) {
      await this.clusterRepo.update(targetClusterId, {
        instance_count: targetCluster.instance_count + sourceInstances.length,
        last_seen_at: new Date().toISOString(),
      });
    }

    // Delete source cluster
    await this.clusterRepo.delete(sourceClusterId);

    logger.info(`Merged cluster ${sourceClusterId} into ${targetClusterId}`);
  }
}
