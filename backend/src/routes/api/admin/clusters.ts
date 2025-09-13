import { Router, Request, Response } from 'express';
import { db } from '../../../database/index.js';
import { QuestionClusterRepository } from '../../../repositories/QuestionClusterRepository.js';
import { QuestionInstanceRepository } from '../../../repositories/QuestionInstanceRepository.js';
import { GoldenAnswerRepository } from '../../../repositories/GoldenAnswerRepository.js';
import { MlClientService } from '../../../services/MlClientService.js';
import { mlServiceConfig } from '../../../config/ml.js';
import logger from '../../../utils/logger.js';
import { sanitizeMarkdown } from '../../../utils/markdown.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const clusterRepo = new QuestionClusterRepository(db);
const instanceRepo = new QuestionInstanceRepository(db);
const goldenAnswerRepo = new GoldenAnswerRepository(db);
const mlClient = new MlClientService(mlServiceConfig);

/**
 * Admin authentication middleware
 * Reuses pattern from analysis router
 */
const requireAdminKey = (
  req: Request,
  res: Response,
  next: () => void
): void | Response => {
  const apiKey = req.headers['x-api-key'];
  const adminKey = process.env.ADMIN_API_KEY || 'ikbeneenaap';

  if (apiKey !== adminKey) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing X-API-KEY header',
      timestamp: new Date().toISOString(),
    });
  }

  next();
};

/**
 * Validate UUID format
 */
const isValidUUID = (uuid: string): boolean => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

/**
 * GET /api/admin/clusters
 * List all question clusters with pagination
 */
router.get(
  '/',
  requireAdminKey,
  async (req: Request, res: Response): Promise<Response> => {
    try {
      const {
        tenant_id,
        page = '1',
        limit = '20',
        sort_by = 'instance_count',
        sort_order = 'desc',
      } = req.query;

      // Validate tenant_id if provided
      if (tenant_id && !isValidUUID(tenant_id as string)) {
        return res.status(400).json({
          error: 'Invalid tenant_id format',
          message: 'tenant_id must be a valid UUID',
          timestamp: new Date().toISOString(),
        });
      }

      // Parse pagination params
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(
        100,
        Math.max(1, parseInt(limit as string, 10) || 20)
      );
      const offset = (pageNum - 1) * limitNum;

      // Validate sort parameters
      const validSortFields = ['instance_count', 'last_seen_at', 'created_at'];
      const sortBy = validSortFields.includes(sort_by as string)
        ? (sort_by as 'instance_count' | 'last_seen_at' | 'created_at')
        : 'instance_count';
      const sortOrder = sort_order === 'asc' ? 'asc' : 'desc';

      // Build query
      let query = db
        .selectFrom('question_clusters')
        .leftJoin(
          'golden_answers',
          'question_clusters.id',
          'golden_answers.cluster_id'
        )
        .selectAll('question_clusters')
        .select(['golden_answers.id as golden_answer_id'])
        .orderBy(`question_clusters.${sortBy}`, sortOrder)
        .limit(limitNum)
        .offset(offset);

      // Add tenant filter if provided
      if (tenant_id) {
        query = query.where(
          'question_clusters.tenant_id',
          '=',
          tenant_id as string
        );
      }

      // Get total count for pagination
      let countQuery = db
        .selectFrom('question_clusters')
        .select(db.fn.count('id').as('count'));

      if (tenant_id) {
        countQuery = countQuery.where('tenant_id', '=', tenant_id as string);
      }

      const [clusters, countResult] = await Promise.all([
        query.execute(),
        countQuery.executeTakeFirst(),
      ]);

      const total = Number(countResult?.count || 0);
      const totalPages = Math.ceil(total / limitNum);

      // Format response
      const formattedClusters = clusters.map((cluster) => ({
        id: cluster.id,
        tenant_id: cluster.tenant_id,
        representative_text: cluster.representative_text,
        thread_title: cluster.thread_title,
        instance_count: cluster.instance_count,
        first_seen_at: cluster.first_seen_at,
        last_seen_at: cluster.last_seen_at,
        has_golden_answer: !!cluster.golden_answer_id,
        created_at: cluster.created_at,
        updated_at: cluster.updated_at,
      }));

      return res.json({
        data: formattedClusters,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages,
        },
      });
    } catch (error) {
      logger.error('Error fetching clusters', { error });
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to fetch clusters',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/admin/clusters/bulk
 * Bulk create clusters or perform other bulk operations
 */
router.post(
  '/bulk',
  requireAdminKey,
  async (req: Request, res: Response): Promise<Response> => {
    try {
      const { action, clusters } = req.body;

      // Validate action
      if (action !== 'create') {
        return res.status(400).json({
          error: 'Invalid action',
          message: 'Only "create" action is supported',
          timestamp: new Date().toISOString(),
        });
      }

      // Validate clusters array
      if (!Array.isArray(clusters) || clusters.length === 0) {
        return res.status(400).json({
          error: 'Invalid input',
          message: 'clusters must be a non-empty array',
          timestamp: new Date().toISOString(),
        });
      }

      // Enforce max limit
      if (clusters.length > 10) {
        return res.status(400).json({
          error: 'Too many clusters',
          message: 'Maximum 10 clusters can be created at once',
          timestamp: new Date().toISOString(),
        });
      }

      // Validate each cluster before creating any (fail-fast)
      for (let i = 0; i < clusters.length; i++) {
        const cluster = clusters[i];

        if (!cluster.tenant_id || !cluster.representative_text) {
          return res.status(400).json({
            error: 'Invalid cluster data',
            message: `Cluster at index ${i} is missing required fields`,
            timestamp: new Date().toISOString(),
          });
        }

        if (!isValidUUID(cluster.tenant_id)) {
          return res.status(400).json({
            error: 'Invalid tenant ID',
            message: `Cluster at index ${i} has invalid tenant_id format`,
            timestamp: new Date().toISOString(),
          });
        }

        if (cluster.representative_text.trim().length === 0) {
          return res.status(400).json({
            error: 'Invalid representative text',
            message: `Cluster at index ${i} has empty representative_text`,
            timestamp: new Date().toISOString(),
          });
        }

        // Validate example_questions if provided
        if (cluster.example_questions && !Array.isArray(cluster.example_questions)) {
          return res.status(400).json({
            error: 'Invalid example questions',
            message: `Cluster at index ${i} has invalid example_questions format`,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Generate embeddings for all clusters in parallel
      const embeddingPromises = clusters.map(async (cluster) => {
        // Combine representative text with example questions for better embedding
        const combinedText = [
          cluster.representative_text,
          ...(cluster.example_questions || [])
        ].join(' ');

        const result = await mlClient.embed(combinedText);
        return result.embedding;
      });

      let embeddings: number[][];
      try {
        embeddings = await Promise.all(embeddingPromises);
      } catch (error) {
        logger.error('Failed to generate embeddings for bulk create:', error);
        return res.status(503).json({
          error: 'ML service unavailable',
          message: 'Failed to generate embeddings for clusters',
          timestamp: new Date().toISOString(),
        });
      }

      // Create all clusters in a transaction
      const createdClusters = await db.transaction().execute(async (trx) => {
        const results = [];

        for (let i = 0; i < clusters.length; i++) {
          const cluster = clusters[i];
          const embedding = embeddings[i];

          // Create cluster with transaction
          const clusterData = {
            id: uuidv4(),
            tenant_id: cluster.tenant_id,
            representative_text: cluster.representative_text.trim(),
            thread_title: cluster.thread_title?.trim() || null,
            embedding: embedding,
            instance_count: 0,
            first_seen_at: new Date(),
            last_seen_at: new Date(),
          };

          // Use the transaction-aware repository
          const transactionalRepo = new QuestionClusterRepository(trx);
          const created = await transactionalRepo.create(clusterData);
          results.push(created);
        }

        return results;
      });

      logger.info(`Bulk created ${createdClusters.length} clusters`);

      return res.status(201).json({
        message: `Successfully created ${createdClusters.length} clusters`,
        clusters: createdClusters,
      });
    } catch (error) {
      logger.error('Error in bulk cluster create:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to create clusters in bulk',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * DELETE /api/admin/clusters/bulk
 * Bulk delete clusters
 */
router.delete(
  '/bulk',
  requireAdminKey,
  async (req: Request, res: Response): Promise<Response> => {
    try {
      const { cluster_ids } = req.body;

      // Validate cluster_ids array
      if (!Array.isArray(cluster_ids) || cluster_ids.length === 0) {
        return res.status(400).json({
          error: 'Invalid input',
          message: 'cluster_ids must be a non-empty array',
          timestamp: new Date().toISOString(),
        });
      }

      // Enforce max limit
      if (cluster_ids.length > 10) {
        return res.status(400).json({
          error: 'Too many clusters',
          message: 'Maximum 10 clusters can be deleted at once',
          timestamp: new Date().toISOString(),
        });
      }

      // Validate all cluster IDs are valid UUIDs
      for (let i = 0; i < cluster_ids.length; i++) {
        if (!isValidUUID(cluster_ids[i])) {
          return res.status(400).json({
            error: 'Invalid cluster ID',
            message: `Cluster ID at index ${i} is not a valid UUID`,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Validate all clusters exist before deleting any
      const clusters = await Promise.all(
        cluster_ids.map(id => clusterRepo.findById(id))
      );

      const missingIndices: number[] = [];
      clusters.forEach((cluster, index) => {
        if (!cluster) {
          missingIndices.push(index);
        }
      });

      if (missingIndices.length > 0) {
        const missingIds = missingIndices.map(i => cluster_ids[i]);
        return res.status(404).json({
          error: 'Clusters not found',
          message: `The following cluster IDs do not exist: ${missingIds.join(', ')}`,
          timestamp: new Date().toISOString(),
        });
      }

      // Delete all clusters in a transaction
      await db.transaction().execute(async (trx) => {
        const transactionalRepo = new QuestionClusterRepository(trx);

        // Call bulkDelete method (we'll implement this next)
        await transactionalRepo.bulkDelete(cluster_ids);
      });

      logger.info(`Bulk deleted ${cluster_ids.length} clusters`);

      // Return 204 No Content on success (matching single delete)
      return res.status(204).send();
    } catch (error) {
      logger.error('Error in bulk cluster delete:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to delete clusters in bulk',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/admin/clusters/:id
 * Get detailed information about a specific cluster
 */
router.get(
  '/:id',
  requireAdminKey,
  async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;

      // Validate cluster ID
      if (!isValidUUID(id)) {
        return res.status(400).json({
          error: 'Invalid cluster ID format',
          message: 'Cluster ID must be a valid UUID',
          timestamp: new Date().toISOString(),
        });
      }

      // Fetch cluster details
      const cluster = await clusterRepo.findById(id);

      if (!cluster) {
        return res.status(404).json({
          error: 'Cluster not found',
          message: `No cluster found with ID ${id}`,
          timestamp: new Date().toISOString(),
        });
      }

      // Fetch golden answer if exists
      const goldenAnswer = await goldenAnswerRepo.findByClusterId(id);

      // Fetch question instances
      const instances = await instanceRepo.findByClusterId(id, {
        limit: 100,
        offset: 0,
      });

      // Format response
      return res.json({
        cluster: {
          id: cluster.id,
          tenant_id: cluster.tenant_id,
          representative_text: cluster.representative_text,
          thread_title: cluster.thread_title,
          instance_count: cluster.instance_count,
          first_seen_at: cluster.first_seen_at,
          last_seen_at: cluster.last_seen_at,
          metadata: cluster.metadata,
          created_at: cluster.created_at,
          updated_at: cluster.updated_at,
        },
        golden_answer: goldenAnswer
          ? {
              id: goldenAnswer.id,
              answer: goldenAnswer.answer,
              answer_format: goldenAnswer.answer_format,
              created_by: goldenAnswer.created_by,
              created_at: goldenAnswer.created_at,
              updated_at: goldenAnswer.updated_at,
            }
          : null,
        instances: instances.map((instance) => ({
          id: instance.id,
          thread_id: instance.thread_id,
          thread_title: instance.thread_title,
          original_text: instance.original_text,
          rephrased_text: instance.rephrased_text,
          confidence_score: instance.confidence_score,
          created_at: instance.created_at,
        })),
      });
    } catch (error) {
      logger.error('Error fetching cluster details', {
        error,
        clusterId: req.params.id,
      });
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to fetch cluster details',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/admin/clusters
 * Manually create a new question cluster with ML embedding generation
 */
router.post(
  '/',
  requireAdminKey,
  async (req: Request, res: Response): Promise<Response> => {
    try {
      const {
        tenant_id,
        representative_text,
        thread_title,
        example_questions,
        metadata = {},
      } = req.body;

      // Validate required fields
      if (!tenant_id || typeof tenant_id !== 'string') {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'tenant_id is required and must be a string',
          timestamp: new Date().toISOString(),
        });
      }

      if (!representative_text || typeof representative_text !== 'string' || representative_text.trim().length === 0) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'representative_text is required and must be a non-empty string',
          timestamp: new Date().toISOString(),
        });
      }

      // Validate tenant_id format
      if (!isValidUUID(tenant_id)) {
        return res.status(400).json({
          error: 'Invalid tenant_id format',
          message: 'tenant_id must be a valid UUID',
          timestamp: new Date().toISOString(),
        });
      }

      // Validate optional fields
      if (thread_title && typeof thread_title !== 'string') {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'thread_title must be a string',
          timestamp: new Date().toISOString(),
        });
      }

      if (example_questions && (!Array.isArray(example_questions) || !example_questions.every((q: any) => typeof q === 'string'))) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'example_questions must be an array of strings',
          timestamp: new Date().toISOString(),
        });
      }

      // Combine representative text with example questions for better embedding
      const textForEmbedding = [
        representative_text.trim(),
        ...(example_questions || []).filter((q: string) => q.trim().length > 0)
      ].join('\n');

      // Generate embedding using ML service
      let embedding: number[];
      try {
        const embeddingResult = await mlClient.embed(textForEmbedding);
        embedding = embeddingResult.embedding;
      } catch (error) {
        logger.error('ML service error during cluster creation', {
          error,
          tenant_id,
          representative_text,
        });
        return res.status(503).json({
          error: 'Service unavailable',
          message: 'Failed to generate embedding - ML service is unavailable',
          timestamp: new Date().toISOString(),
        });
      }

      // Create cluster with manual source metadata
      const clusterId = uuidv4();
      const now = new Date().toISOString();

      const clusterData = {
        id: clusterId,
        tenant_id,
        representative_text: representative_text.trim(),
        thread_title: thread_title?.trim() || null,
        embedding: embedding,
        instance_count: 0,
        first_seen_at: now,
        last_seen_at: now,
        metadata: {
          ...metadata,
          source: 'manual',
          example_questions: example_questions || [],
        },
        created_at: now,
        updated_at: now,
      };

      const cluster = await clusterRepo.create(clusterData);

      logger.info('Manual cluster created successfully', {
        cluster_id: clusterId,
        tenant_id,
        representative_text: representative_text.substring(0, 100),
        example_questions_count: example_questions?.length || 0,
      });

      return res.status(201).json({
        message: 'Cluster created successfully',
        cluster: {
          id: cluster.id,
          tenant_id: cluster.tenant_id,
          representative_text: cluster.representative_text,
          thread_title: cluster.thread_title,
          instance_count: cluster.instance_count,
          first_seen_at: cluster.first_seen_at,
          last_seen_at: cluster.last_seen_at,
          metadata: cluster.metadata,
          created_at: cluster.created_at,
          updated_at: cluster.updated_at,
        },
      });
    } catch (error) {
      logger.error('Error creating cluster', {
        error,
        body: req.body,
      });
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to create cluster',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * DELETE /api/admin/clusters/:id
 * Delete a question cluster and all associated data
 */
router.delete(
  '/:id',
  requireAdminKey,
  async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;

      // Validate cluster ID
      if (!isValidUUID(id)) {
        return res.status(400).json({
          error: 'Invalid cluster ID format',
          message: 'Cluster ID must be a valid UUID',
          timestamp: new Date().toISOString(),
        });
      }

      // Check if cluster exists
      const cluster = await clusterRepo.findById(id);
      if (!cluster) {
        return res.status(404).json({
          error: 'Cluster not found',
          message: `No cluster found with ID ${id}`,
          timestamp: new Date().toISOString(),
        });
      }

      // Delete cluster (cascade deletion handled by DB constraints)
      const deleted = await clusterRepo.delete(id);

      if (!deleted) {
        return res.status(500).json({
          error: 'Failed to delete',
          message: 'Could not delete cluster',
          timestamp: new Date().toISOString(),
        });
      }

      logger.info('Cluster deleted successfully', {
        cluster_id: id,
        tenant_id: cluster.tenant_id,
        representative_text: cluster.representative_text.substring(0, 100),
        instance_count: cluster.instance_count,
      });

      return res.status(204).send();
    } catch (error) {
      logger.error('Error deleting cluster', {
        error,
        clusterId: req.params.id,
      });
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to delete cluster',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/admin/clusters/:id/golden-answer
 * Create or update golden answer for a cluster
 */
router.post(
  '/:id/golden-answer',
  requireAdminKey,
  async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;
      const {
        answer,
        answer_format = 'markdown',
        created_by = 'admin',
      } = req.body;

      // Validate cluster ID
      if (!isValidUUID(id)) {
        return res.status(400).json({
          error: 'Invalid cluster ID format',
          message: 'Cluster ID must be a valid UUID',
          timestamp: new Date().toISOString(),
        });
      }

      // Validate required fields
      if (!answer || typeof answer !== 'string' || answer.trim().length === 0) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'Answer is required and must be a non-empty string',
          timestamp: new Date().toISOString(),
        });
      }

      // Validate answer_format
      if (!['markdown', 'plaintext'].includes(answer_format)) {
        return res.status(400).json({
          error: 'Invalid answer_format',
          message: 'answer_format must be either "markdown" or "plaintext"',
          timestamp: new Date().toISOString(),
        });
      }

      // Sanitize markdown content if format is markdown
      const sanitizedAnswer =
        answer_format === 'markdown'
          ? sanitizeMarkdown(answer.trim())
          : answer.trim();

      // Check if cluster exists
      const cluster = await clusterRepo.findById(id);
      if (!cluster) {
        return res.status(404).json({
          error: 'Cluster not found',
          message: `No cluster found with ID ${id}`,
          timestamp: new Date().toISOString(),
        });
      }

      // Create or update golden answer
      const goldenAnswer = await goldenAnswerRepo.upsert({
        cluster_id: id,
        tenant_id: cluster.tenant_id,
        answer: sanitizedAnswer,
        answer_format,
        created_by,
      });

      return res.status(201).json({
        message: 'Golden answer saved successfully',
        golden_answer: {
          id: goldenAnswer.id,
          cluster_id: goldenAnswer.cluster_id,
          answer: goldenAnswer.answer,
          answer_format: goldenAnswer.answer_format,
          created_by: goldenAnswer.created_by,
          created_at: goldenAnswer.created_at,
          updated_at: goldenAnswer.updated_at,
        },
      });
    } catch (error) {
      logger.error('Error saving golden answer', {
        error,
        clusterId: req.params.id,
        body: req.body,
      });
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to save golden answer',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * PATCH /api/admin/clusters/:id
 * Update cluster fields (currently only representative_text)
 */
router.patch(
  '/:id',
  requireAdminKey,
  async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;
      const { representative_text } = req.body;

      // Validate cluster ID
      if (!isValidUUID(id)) {
        return res.status(400).json({
          error: 'Invalid cluster ID format',
          message: 'Cluster ID must be a valid UUID',
          timestamp: new Date().toISOString(),
        });
      }

      // Validate representative_text if provided
      if (representative_text !== undefined) {
        if (
          typeof representative_text !== 'string' ||
          representative_text.trim().length === 0
        ) {
          return res.status(400).json({
            error: 'Invalid request',
            message: 'representative_text must be a non-empty string',
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Check if cluster exists
      const cluster = await clusterRepo.findById(id);
      if (!cluster) {
        return res.status(404).json({
          error: 'Cluster not found',
          message: `No cluster found with ID ${id}`,
          timestamp: new Date().toISOString(),
        });
      }

      // Update cluster
      const updateData: Partial<{
        representative_text: string;
        updated_at: string;
      }> = {
        updated_at: new Date().toISOString(),
      };

      if (representative_text !== undefined) {
        updateData.representative_text = representative_text.trim();
      }

      const updated = await clusterRepo.update(id, updateData);

      if (!updated) {
        return res.status(500).json({
          error: 'Failed to update',
          message: 'Could not update cluster',
          timestamp: new Date().toISOString(),
        });
      }

      // Fetch updated cluster
      const updatedCluster = await clusterRepo.findById(id);

      return res.json({
        message: 'Cluster updated successfully',
        cluster: {
          id: updatedCluster!.id,
          tenant_id: updatedCluster!.tenant_id,
          representative_text: updatedCluster!.representative_text,
          thread_title: updatedCluster!.thread_title,
          instance_count: updatedCluster!.instance_count,
          first_seen_at: updatedCluster!.first_seen_at,
          last_seen_at: updatedCluster!.last_seen_at,
          created_at: updatedCluster!.created_at,
          updated_at: updatedCluster!.updated_at,
        },
      });
    } catch (error) {
      logger.error('Error updating cluster', {
        error,
        clusterId: req.params.id,
        body: req.body,
      });
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to update cluster',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * DELETE /api/admin/clusters/:id/golden-answer
 * Remove golden answer from a cluster
 */
router.delete(
  '/:id/golden-answer',
  requireAdminKey,
  async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;

      // Validate cluster ID
      if (!isValidUUID(id)) {
        return res.status(400).json({
          error: 'Invalid cluster ID format',
          message: 'Cluster ID must be a valid UUID',
          timestamp: new Date().toISOString(),
        });
      }

      // Check if golden answer exists
      const goldenAnswer = await goldenAnswerRepo.findByClusterId(id);
      if (!goldenAnswer) {
        return res.status(404).json({
          error: 'Golden answer not found',
          message: `No golden answer found for cluster ${id}`,
          timestamp: new Date().toISOString(),
        });
      }

      // Delete golden answer
      const deleted = await goldenAnswerRepo.deleteByClusterId(id);

      if (!deleted) {
        return res.status(500).json({
          error: 'Failed to delete',
          message: 'Could not delete golden answer',
          timestamp: new Date().toISOString(),
        });
      }

      return res.json({
        message: 'Golden answer deleted successfully',
        cluster_id: id,
      });
    } catch (error) {
      logger.error('Error deleting golden answer', {
        error,
        clusterId: req.params.id,
      });
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to delete golden answer',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;
