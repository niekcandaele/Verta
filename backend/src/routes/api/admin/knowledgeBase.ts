import { Router, Request, Response } from 'express';
import { db } from '../../../database/index.js';
import { KnowledgeBaseRepositoryImpl } from '../../../repositories/knowledgeBase/KnowledgeBaseRepository.js';
import { KnowledgeBaseService } from '../../../services/knowledgeBase/KnowledgeBaseService.js';
import {
  createKnowledgeBaseSchema,
  updateKnowledgeBaseSchema,
  type CreateKnowledgeBaseInput,
  type UpdateKnowledgeBaseInput,
} from '../../../validation/knowledgeBase.js';
import { addKnowledgeBaseSitemapJob } from '../../../queues/knowledgeBaseQueue.js';
import logger from '../../../utils/logger.js';
import type { KnowledgeBase } from '../../../database/types.js';

const router = Router();
const knowledgeBaseRepository = new KnowledgeBaseRepositoryImpl(db);
const knowledgeBaseService = new KnowledgeBaseService(knowledgeBaseRepository);

/**
 * Admin authentication middleware
 * Reuses pattern from other admin routers
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
 * GET /api/admin/knowledge-bases
 * List all knowledge bases with optional tenant filter and pagination
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
        sort_by = 'created_at',
        sort_order = 'desc',
      } = req.query;

      // Validate tenant_id if provided
      if (tenant_id && typeof tenant_id === 'string' && !isValidUUID(tenant_id)) {
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

      // Validate sort parameters
      const validSortFields = ['name', 'created_at', 'last_crawled_at'];
      const sortBy = validSortFields.includes(sort_by as string)
        ? (sort_by as 'name' | 'created_at' | 'last_crawled_at')
        : 'created_at';
      const sortOrder = sort_order === 'asc' ? 'asc' : 'desc';

      // Fetch knowledge bases based on whether tenant_id is provided
      let result;
      if (tenant_id && typeof tenant_id === 'string') {
        // Get knowledge bases for specific tenant
        result = await knowledgeBaseService.getAllWithStats(tenant_id);
      } else {
        // Get all knowledge bases across all tenants
        result = await knowledgeBaseService.findAllWithStats({
          page: pageNum,
          limit: limitNum,
          sortBy,
          sortOrder,
        });
      }

      if (!result.success) {
        logger.error('Failed to fetch knowledge bases', {
          error: result.error,
          tenant_id,
          page: pageNum,
          limit: limitNum,
        });
        return res.status(400).json({
          error: 'Failed to fetch knowledge bases',
          message: result.error?.message || 'Unknown error',
          timestamp: new Date().toISOString(),
        });
      }

      // Format response based on whether we have paginated data or not
      if (tenant_id) {
        // For tenant-specific query, paginate in memory
        if (!result.success || !result.data) {
          return res.status(400).json({
            error: 'Failed to fetch knowledge bases',
            message: 'No data returned',
            timestamp: new Date().toISOString(),
          });
        }
        
        const data = result.data as Array<{
          knowledgeBase: KnowledgeBase;
          chunkCount: number;
          lastChunkCreated?: Date;
        }>;
        const start = (pageNum - 1) * limitNum;
        const end = start + limitNum;
        const paginatedData = data.slice(start, end);
        
        return res.json({
          data: paginatedData.map(item => ({
            ...item.knowledgeBase,
            chunk_count: item.chunkCount,
            last_chunk_created: item.lastChunkCreated,
          })),
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: data.length,
            totalPages: Math.ceil(data.length / limitNum),
          },
        });
      } else {
        // For all knowledge bases, we already have paginated data
        if (!result.success || !result.data) {
          return res.status(400).json({
            error: 'Failed to fetch knowledge bases',
            message: 'No data returned',
            timestamp: new Date().toISOString(),
          });
        }
        
        return res.json(result.data);
      }
    } catch (error) {
      logger.error('Error fetching knowledge bases', { error });
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to fetch knowledge bases',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/admin/knowledge-bases/:id
 * Get detailed information about a specific knowledge base
 */
router.get(
  '/:id',
  requireAdminKey,
  async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;

      // Validate knowledge base ID
      if (!isValidUUID(id)) {
        return res.status(400).json({
          error: 'Invalid knowledge base ID format',
          message: 'Knowledge base ID must be a valid UUID',
          timestamp: new Date().toISOString(),
        });
      }

      // Fetch knowledge base with stats
      const kbResult = await knowledgeBaseService.findById(id);

      if (!kbResult.success) {
        if (kbResult.error?.type === 'NOT_FOUND') {
          return res.status(404).json({
            error: 'Knowledge base not found',
            message: `No knowledge base found with ID ${id}`,
            timestamp: new Date().toISOString(),
          });
        }
        return res.status(400).json({
          error: 'Failed to fetch knowledge base',
          message: kbResult.error?.message || 'Unknown error',
          timestamp: new Date().toISOString(),
        });
      }

      // Get chunk count for this knowledge base
      const chunkCount = await db
        .selectFrom('knowledge_base_chunks')
        .where('knowledge_base_id', '=', id)
        .select(db.fn.count('id').as('count'))
        .executeTakeFirst();

      return res.json({
        ...kbResult.data,
        chunk_count: Number(chunkCount?.count || 0),
      });
    } catch (error) {
      logger.error('Error fetching knowledge base details', {
        error,
        knowledgeBaseId: req.params.id,
      });
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to fetch knowledge base details',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/admin/knowledge-bases
 * Create a new knowledge base
 */
router.post(
  '/',
  requireAdminKey,
  async (req: Request, res: Response): Promise<Response> => {
    try {
      // Validate request body
      const validationResult = createKnowledgeBaseSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        const firstError = validationResult.error.issues[0];
        return res.status(400).json({
          error: 'Validation error',
          message: firstError.message,
          field: firstError.path.join('.'),
          timestamp: new Date().toISOString(),
        });
      }

      const requestData = validationResult.data as CreateKnowledgeBaseInput;

      // Create knowledge base
      const result = await knowledgeBaseService.create(requestData);

      if (!result.success) {
        return res.status(400).json({
          error: 'Failed to create knowledge base',
          message: result.error?.message || 'Unknown error',
          timestamp: new Date().toISOString(),
        });
      }

      return res.status(201).json({
        message: 'Knowledge base created successfully',
        data: result.data,
      });
    } catch (error) {
      logger.error('Error creating knowledge base', {
        error,
        body: req.body,
      });
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to create knowledge base',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * PUT /api/admin/knowledge-bases/:id
 * Update a knowledge base
 */
router.put(
  '/:id',
  requireAdminKey,
  async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;

      // Validate knowledge base ID
      if (!isValidUUID(id)) {
        return res.status(400).json({
          error: 'Invalid knowledge base ID format',
          message: 'Knowledge base ID must be a valid UUID',
          timestamp: new Date().toISOString(),
        });
      }

      // Validate request body
      const validationResult = updateKnowledgeBaseSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        const firstError = validationResult.error.issues[0];
        return res.status(400).json({
          error: 'Validation error',
          message: firstError.message,
          field: firstError.path.join('.'),
          timestamp: new Date().toISOString(),
        });
      }

      const requestData = validationResult.data as UpdateKnowledgeBaseInput;

      // Check if body is empty
      if (Object.keys(requestData).length === 0) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'At least one field must be provided to update',
          timestamp: new Date().toISOString(),
        });
      }

      // Update knowledge base
      const result = await knowledgeBaseService.update(id, requestData);

      if (!result.success) {
        if (result.error?.type === 'NOT_FOUND') {
          return res.status(404).json({
            error: 'Knowledge base not found',
            message: `No knowledge base found with ID ${id}`,
            timestamp: new Date().toISOString(),
          });
        }
        return res.status(400).json({
          error: 'Failed to update knowledge base',
          message: result.error?.message || 'Unknown error',
          timestamp: new Date().toISOString(),
        });
      }

      return res.json({
        message: 'Knowledge base updated successfully',
        data: result.data,
      });
    } catch (error) {
      logger.error('Error updating knowledge base', {
        error,
        knowledgeBaseId: req.params.id,
        body: req.body,
      });
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to update knowledge base',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * DELETE /api/admin/knowledge-bases/:id
 * Delete a knowledge base and all its chunks
 */
router.delete(
  '/:id',
  requireAdminKey,
  async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;

      // Validate knowledge base ID
      if (!isValidUUID(id)) {
        return res.status(400).json({
          error: 'Invalid knowledge base ID format',
          message: 'Knowledge base ID must be a valid UUID',
          timestamp: new Date().toISOString(),
        });
      }

      // Delete knowledge base
      const result = await knowledgeBaseService.delete(id);

      if (!result.success) {
        if (result.error?.type === 'NOT_FOUND') {
          return res.status(404).json({
            error: 'Knowledge base not found',
            message: `No knowledge base found with ID ${id}`,
            timestamp: new Date().toISOString(),
          });
        }
        return res.status(400).json({
          error: 'Failed to delete knowledge base',
          message: result.error?.message || 'Unknown error',
          timestamp: new Date().toISOString(),
        });
      }

      return res.json({
        message: 'Knowledge base deleted successfully',
        id: id,
      });
    } catch (error) {
      logger.error('Error deleting knowledge base', {
        error,
        knowledgeBaseId: req.params.id,
      });
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to delete knowledge base',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/admin/knowledge-bases/:id/crawl
 * Manually trigger a crawl for a knowledge base
 */
router.post(
  '/:id/crawl',
  requireAdminKey,
  async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;

      // Validate knowledge base ID
      if (!isValidUUID(id)) {
        return res.status(400).json({
          error: 'Invalid knowledge base ID format',
          message: 'Knowledge base ID must be a valid UUID',
          timestamp: new Date().toISOString(),
        });
      }

      // Check if knowledge base exists
      const kbResult = await knowledgeBaseService.findById(id);
      if (!kbResult.success || !kbResult.data) {
        return res.status(404).json({
          error: 'Knowledge base not found',
          message: `No knowledge base found with ID ${id}`,
          timestamp: new Date().toISOString(),
        });
      }

      const knowledgeBase = kbResult.data;

      // Queue sitemap job (which will create individual URL jobs)
      const jobId = await addKnowledgeBaseSitemapJob({
        knowledgeBaseId: id,
        tenantId: knowledgeBase.tenant_id,
        sitemapUrl: knowledgeBase.sitemap_url,
        name: knowledgeBase.name,
        isInitialCrawl: knowledgeBase.last_crawled_at === null,
      }, {
        priority: 10, // High priority for manual triggers
      });

      return res.status(202).json({
        message: 'Crawl job queued successfully',
        knowledge_base_id: id,
        job_id: jobId,
        status: 'queued',
      });
    } catch (error) {
      logger.error('Error triggering crawl', {
        error,
        knowledgeBaseId: req.params.id,
      });
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to trigger crawl',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;