import { z } from 'zod';
import { BaseCrudServiceImpl } from '../BaseCrudService.js';
import type {
  KnowledgeBase,
  NewKnowledgeBase,
  KnowledgeBaseUpdate,
} from '../../database/types.js';
import type { KnowledgeBaseRepository } from '../../repositories/knowledgeBase/types.js';
import type { ServiceResult } from '../types.js';
import { 
  createErrorResult, 
  createSuccessResult,
  createServiceError,
  ServiceErrorType 
} from '../types.js';
import logger from '../../utils/logger.js';

/**
 * Validation schemas for knowledge base operations
 */
const createKnowledgeBaseSchema = z.object({
  tenant_id: z.string().uuid('Invalid tenant ID format'),
  name: z.string()
    .min(1, 'Name is required')
    .max(255, 'Name must be less than 255 characters'),
  description: z.string()
    .max(1000, 'Description must be less than 1000 characters')
    .optional()
    .nullable(),
  sitemap_url: z.string()
    .url('Invalid URL format')
    .refine(url => url.startsWith('https://'), {
      message: 'Only HTTPS URLs are allowed for security',
    })
    .refine(url => url.endsWith('.xml') || url.includes('sitemap'), {
      message: 'URL should point to an XML sitemap',
    }),
});

const updateKnowledgeBaseSchema = z.object({
  name: z.string()
    .min(1, 'Name cannot be empty')
    .max(255, 'Name must be less than 255 characters')
    .optional(),
  description: z.string()
    .max(1000, 'Description must be less than 1000 characters')
    .optional()
    .nullable(),
  sitemap_url: z.string()
    .url('Invalid URL format')
    .refine(url => url.startsWith('https://'), {
      message: 'Only HTTPS URLs are allowed for security',
    })
    .refine(url => url.endsWith('.xml') || url.includes('sitemap'), {
      message: 'URL should point to an XML sitemap',
    })
    .optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

/**
 * Service for knowledge base management
 */
export class KnowledgeBaseService
  extends BaseCrudServiceImpl<KnowledgeBase, NewKnowledgeBase, KnowledgeBaseUpdate>
{
  constructor(
    private readonly knowledgeBaseRepository: KnowledgeBaseRepository
  ) {
    super(knowledgeBaseRepository);
  }

  /**
   * Create a new knowledge base with validation
   */
  async create(data: NewKnowledgeBase): Promise<ServiceResult<KnowledgeBase>> {
    try {
      // Validate input data
      const validatedData = createKnowledgeBaseSchema.parse(data);

      // Check if a knowledge base with the same URL already exists for this tenant
      const existing = await this.knowledgeBaseRepository.findByTenant(validatedData.tenant_id);
      const duplicateUrl = existing.find(kb => kb.sitemap_url === validatedData.sitemap_url);
      
      if (duplicateUrl) {
        return createErrorResult(
          createServiceError(
            ServiceErrorType.VALIDATION_ERROR,
            'A knowledge base with this sitemap URL already exists'
          )
        );
      }

      // Create the knowledge base
      const knowledgeBase = await this.knowledgeBaseRepository.create(validatedData);

      logger.info('Knowledge base created', {
        id: knowledgeBase.id,
        name: knowledgeBase.name,
        tenant_id: knowledgeBase.tenant_id,
      });

      return createSuccessResult(knowledgeBase);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return createErrorResult(
          createServiceError(
            ServiceErrorType.VALIDATION_ERROR,
            error.issues[0].message
          )
        );
      }
      return super.handleRepositoryError(error);
    }
  }

  /**
   * Update a knowledge base with validation
   */
  async update(id: string, data: KnowledgeBaseUpdate): Promise<ServiceResult<KnowledgeBase>> {
    try {
      // Validate input data
      const validatedData = updateKnowledgeBaseSchema.parse(data);

      // Check if knowledge base exists
      const existing = await this.knowledgeBaseRepository.findById(id);
      if (!existing) {
        return createErrorResult(
          createServiceError(ServiceErrorType.NOT_FOUND, 'Knowledge base not found')
        );
      }

      // If URL is being updated, check for duplicates
      if (validatedData.sitemap_url && validatedData.sitemap_url !== existing.sitemap_url) {
        const allKbs = await this.knowledgeBaseRepository.findByTenant(existing.tenant_id);
        const duplicateUrl = allKbs.find(
          kb => kb.sitemap_url === validatedData.sitemap_url && kb.id !== id
        );
        
        if (duplicateUrl) {
          return createErrorResult(
            createServiceError(
              ServiceErrorType.VALIDATION_ERROR,
              'Another knowledge base with this sitemap URL already exists'
            )
          );
        }
      }

      // Update the knowledge base
      const updated = await this.knowledgeBaseRepository.update(id, validatedData);

      if (!updated) {
        return createErrorResult(
          createServiceError(ServiceErrorType.NOT_FOUND, 'Knowledge base not found')
        );
      }

      logger.info('Knowledge base updated', {
        id: updated.id,
        changes: Object.keys(validatedData),
      });

      return createSuccessResult(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return createErrorResult(
          createServiceError(
            ServiceErrorType.VALIDATION_ERROR,
            error.issues[0].message
          )
        );
      }
      return super.handleRepositoryError(error);
    }
  }

  /**
   * Get knowledge bases for a tenant
   */
  async getByTenant(tenantId: string): Promise<ServiceResult<KnowledgeBase[]>> {
    try {
      const knowledgeBases = await this.knowledgeBaseRepository.findByTenant(tenantId);
      return createSuccessResult(knowledgeBases);
    } catch (error) {
      return super.handleRepositoryError(error);
    }
  }


  /**
   * Mark knowledge base as crawled
   */
  async markAsCrawled(id: string): Promise<ServiceResult<void>> {
    try {
      const existing = await this.knowledgeBaseRepository.findById(id);
      if (!existing) {
        return createErrorResult(
          createServiceError(ServiceErrorType.NOT_FOUND, 'Knowledge base not found')
        );
      }

      await this.knowledgeBaseRepository.updateLastCrawled(id, new Date());

      logger.info('Knowledge base marked as crawled', { id });

      return createSuccessResult(undefined);
    } catch (error) {
      return super.handleRepositoryError(error);
    }
  }

  /**
   * Get knowledge base with chunk statistics
   */
  async getWithStats(id: string): Promise<ServiceResult<{
    knowledgeBase: KnowledgeBase;
    chunkCount: number;
    lastChunkCreated?: Date;
  }>> {
    try {
      const knowledgeBase = await this.knowledgeBaseRepository.findById(id);
      if (!knowledgeBase) {
        return createErrorResult(
          createServiceError(ServiceErrorType.NOT_FOUND, 'Knowledge base not found')
        );
      }

      // For now, return mock stats - will be implemented when chunk repository is added
      const result = {
        knowledgeBase,
        chunkCount: 0,
        lastChunkCreated: undefined,
      };

      return createSuccessResult(result);
    } catch (error) {
      return super.handleRepositoryError(error);
    }
  }

  /**
   * Get all knowledge bases across all tenants with stats and pagination
   */
  async findAllWithStats(options?: {
    page?: number;
    limit?: number;
    sortBy?: 'name' | 'created_at' | 'last_crawled_at';
    sortOrder?: 'asc' | 'desc';
  }): Promise<ServiceResult<{
    data: Array<{
      id: string;
      tenant_id: string;
      name: string;
      sitemap_url: string;
      last_crawled_at: Date | null;
      last_crawl_event: Date | null;
      created_at: Date;
      updated_at: Date;
      chunk_count: number;
      last_chunk_created: Date | null;
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }>> {
    try {
      const result = await this.knowledgeBaseRepository.findAllWithStats(options);
      return createSuccessResult(result);
    } catch (error) {
      return super.handleRepositoryError(error);
    }
  }

  /**
   * Get all knowledge bases for a tenant with stats
   */
  async getAllWithStats(tenantId: string): Promise<ServiceResult<Array<{
    knowledgeBase: KnowledgeBase;
    chunkCount: number;
    lastChunkCreated?: Date;
  }>>> {
    try {
      const knowledgeBases = await this.knowledgeBaseRepository.findByTenant(tenantId);
      
      // For now, return mock stats - will be implemented when chunk repository is added
      const results = knowledgeBases.map(kb => ({
        knowledgeBase: kb,
        chunkCount: 0,
        lastChunkCreated: undefined,
      }));

      return createSuccessResult(results);
    } catch (error) {
      return super.handleRepositoryError(error);
    }
  }

}