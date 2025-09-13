import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KnowledgeBaseService } from '../KnowledgeBaseService.js';
import type { 
  KnowledgeBase,
  NewKnowledgeBase,
  KnowledgeBaseUpdate 
} from '../../../database/types.js';
import type { KnowledgeBaseRepository } from '../../../repositories/knowledgeBase/types.js';
import { ServiceErrorType } from '../../../services/types.js';

// Mock the logger
vi.mock('../../../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('KnowledgeBaseService', () => {
  let service: KnowledgeBaseService;
  let mockRepository: KnowledgeBaseRepository;

  const mockKnowledgeBase: KnowledgeBase = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    tenant_id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Test Knowledge Base',
    sitemap_url: 'https://example.com/sitemap.xml',
    status: 'active',
    last_crawled_at: null,
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01'),
  };

  beforeEach(() => {
    // Create mock repository
    mockRepository = {
      create: vi.fn(),
      findById: vi.fn(),
      findByTenant: vi.fn(),
      findAll: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      updateStatus: vi.fn(),
      updateLastCrawled: vi.fn(),
    };

    service = new KnowledgeBaseService(mockRepository);
  });

  describe('create', () => {
    const validCreateData: NewKnowledgeBase = {
      tenant_id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Test Knowledge Base',
      sitemap_url: 'https://example.com/sitemap.xml',
    };

    it('should create a knowledge base with valid data', async () => {
      vi.mocked(mockRepository.findByTenant).mockResolvedValue([]);
      vi.mocked(mockRepository.create).mockResolvedValue(mockKnowledgeBase);

      const result = await service.create(validCreateData);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockKnowledgeBase);
      expect(mockRepository.create).toHaveBeenCalledWith({
        ...validCreateData,
        status: 'active',
      });
    });

    it('should reject non-HTTPS URLs', async () => {
      const invalidData = {
        ...validCreateData,
        sitemap_url: 'http://example.com/sitemap.xml',
      };

      const result = await service.create(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Only HTTPS URLs are allowed');
      expect(mockRepository.create).not.toHaveBeenCalled();
    });

    it('should reject invalid URL format', async () => {
      const invalidData = {
        ...validCreateData,
        sitemap_url: 'not-a-url',
      };

      const result = await service.create(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Invalid URL format');
      expect(mockRepository.create).not.toHaveBeenCalled();
    });

    it('should reject URLs that do not look like sitemaps', async () => {
      const invalidData = {
        ...validCreateData,
        sitemap_url: 'https://example.com/page.html',
      };

      const result = await service.create(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('URL should point to an XML sitemap');
      expect(mockRepository.create).not.toHaveBeenCalled();
    });

    it('should reject duplicate sitemap URLs for the same tenant', async () => {
      vi.mocked(mockRepository.findByTenant).mockResolvedValue([mockKnowledgeBase]);

      const result = await service.create(validCreateData);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('already exists');
      expect(mockRepository.create).not.toHaveBeenCalled();
    });

    it('should validate name length', async () => {
      const invalidData = {
        ...validCreateData,
        name: 'a'.repeat(256),
      };

      const result = await service.create(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('less than 255 characters');
    });
  });

  describe('update', () => {
    const validUpdateData: KnowledgeBaseUpdate = {
      name: 'Updated Knowledge Base',
    };

    it('should update a knowledge base', async () => {
      vi.mocked(mockRepository.findById).mockResolvedValue(mockKnowledgeBase);
      vi.mocked(mockRepository.update).mockResolvedValue({
        ...mockKnowledgeBase,
        ...validUpdateData,
      });

      const result = await service.update(mockKnowledgeBase.id, validUpdateData);

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('Updated Knowledge Base');
      expect(mockRepository.update).toHaveBeenCalledWith(
        mockKnowledgeBase.id,
        validUpdateData
      );
    });

    it('should return NOT_FOUND for non-existent knowledge base', async () => {
      vi.mocked(mockRepository.findById).mockResolvedValue(undefined);

      const result = await service.update('non-existent', validUpdateData);

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe(ServiceErrorType.NOT_FOUND);
      expect(mockRepository.update).not.toHaveBeenCalled();
    });

    it('should prevent duplicate sitemap URLs when updating', async () => {
      const otherKb = { ...mockKnowledgeBase, id: 'other-id', sitemap_url: 'https://other.com/sitemap.xml' };
      vi.mocked(mockRepository.findById).mockResolvedValue(otherKb);
      vi.mocked(mockRepository.findByTenant).mockResolvedValue([
        mockKnowledgeBase,
        otherKb,
      ]);

      const result = await service.update(otherKb.id, {
        sitemap_url: mockKnowledgeBase.sitemap_url,
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('already exists');
    });
  });

  describe('updateStatus', () => {
    it('should allow status transition from processing to active', async () => {
      const processingKb = { ...mockKnowledgeBase, status: 'processing' as const };
      vi.mocked(mockRepository.findById).mockResolvedValue(processingKb);
      vi.mocked(mockRepository.updateStatus).mockResolvedValue();

      const result = await service.updateStatus(mockKnowledgeBase.id, 'active');

      expect(result.success).toBe(true);
      expect(mockRepository.updateStatus).toHaveBeenCalledWith(
        mockKnowledgeBase.id,
        'active'
      );
    });

    it('should allow retry from failed state', async () => {
      const failedKb = { ...mockKnowledgeBase, status: 'failed' as const };
      vi.mocked(mockRepository.findById).mockResolvedValue(failedKb);
      vi.mocked(mockRepository.updateStatus).mockResolvedValue();

      const result = await service.updateStatus(mockKnowledgeBase.id, 'active');

      expect(result.success).toBe(true);
      expect(mockRepository.updateStatus).toHaveBeenCalled();
    });

    it('should always allow deactivation', async () => {
      vi.mocked(mockRepository.findById).mockResolvedValue(mockKnowledgeBase);
      vi.mocked(mockRepository.updateStatus).mockResolvedValue();

      const result = await service.updateStatus(mockKnowledgeBase.id, 'inactive');

      expect(result.success).toBe(true);
      expect(mockRepository.updateStatus).toHaveBeenCalled();
    });

    it('should prevent invalid status transitions', async () => {
      vi.mocked(mockRepository.findById).mockResolvedValue(mockKnowledgeBase);

      const result = await service.updateStatus(mockKnowledgeBase.id, 'processing');

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Cannot transition');
      expect(mockRepository.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('markAsCrawled', () => {
    it('should update last crawled timestamp', async () => {
      vi.mocked(mockRepository.findById).mockResolvedValue(mockKnowledgeBase);
      vi.mocked(mockRepository.updateLastCrawled).mockResolvedValue();

      const result = await service.markAsCrawled(mockKnowledgeBase.id);

      expect(result.success).toBe(true);
      expect(mockRepository.updateLastCrawled).toHaveBeenCalledWith(
        mockKnowledgeBase.id,
        expect.any(Date)
      );
    });

    it('should return NOT_FOUND for non-existent knowledge base', async () => {
      vi.mocked(mockRepository.findById).mockResolvedValue(undefined);

      const result = await service.markAsCrawled('non-existent');

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe(ServiceErrorType.NOT_FOUND);
      expect(mockRepository.updateLastCrawled).not.toHaveBeenCalled();
    });
  });

  describe('getByTenant', () => {
    it('should return knowledge bases for a tenant', async () => {
      const kbList = [mockKnowledgeBase];
      vi.mocked(mockRepository.findByTenant).mockResolvedValue(kbList);

      const result = await service.getByTenant('123e4567-e89b-12d3-a456-426614174000');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(kbList);
      expect(mockRepository.findByTenant).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000');
    });
  });

  describe('getWithStats', () => {
    it('should return knowledge base with stats', async () => {
      vi.mocked(mockRepository.findById).mockResolvedValue(mockKnowledgeBase);

      const result = await service.getWithStats(mockKnowledgeBase.id);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        knowledgeBase: mockKnowledgeBase,
        chunkCount: 0,
        lastChunkCreated: undefined,
      });
    });

    it('should return NOT_FOUND for non-existent knowledge base', async () => {
      vi.mocked(mockRepository.findById).mockResolvedValue(undefined);

      const result = await service.getWithStats('non-existent');

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe(ServiceErrorType.NOT_FOUND);
    });
  });

  describe('getAllWithStats', () => {
    it('should return all knowledge bases with stats for a tenant', async () => {
      const kbList = [mockKnowledgeBase];
      vi.mocked(mockRepository.findByTenant).mockResolvedValue(kbList);

      const result = await service.getAllWithStats('123e4567-e89b-12d3-a456-426614174000');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0]).toEqual({
        knowledgeBase: mockKnowledgeBase,
        chunkCount: 0,
        lastChunkCreated: undefined,
      });
    });
  });

  describe('error handling', () => {
    it('should handle duplicate key errors', async () => {
      vi.mocked(mockRepository.findByTenant).mockResolvedValue([]);
      vi.mocked(mockRepository.create).mockRejectedValue(
        new Error('duplicate key value')
      );

      const result = await service.create({
        tenant_id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test',
        sitemap_url: 'https://example.com/sitemap.xml',
      });

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe(ServiceErrorType.DUPLICATE_ENTRY);
    });

    it('should handle foreign key errors', async () => {
      vi.mocked(mockRepository.findByTenant).mockResolvedValue([]);
      vi.mocked(mockRepository.create).mockRejectedValue(
        new Error('foreign key constraint')
      );

      const result = await service.create({
        tenant_id: '223e4567-e89b-12d3-a456-426614174000',
        name: 'Test',
        sitemap_url: 'https://example.com/sitemap.xml',
      });

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe(ServiceErrorType.BUSINESS_RULE_VIOLATION);
    });

    it('should handle unexpected errors', async () => {
      vi.mocked(mockRepository.findByTenant).mockRejectedValue(
        new Error('Unexpected error')
      );

      const result = await service.getByTenant('123e4567-e89b-12d3-a456-426614174000');

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe(ServiceErrorType.INTERNAL_ERROR);
    });
  });
});