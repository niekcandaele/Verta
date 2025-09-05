import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GoldenAnswerRepository } from '../GoldenAnswerRepository.js';
import type { NewGoldenAnswer, GoldenAnswerUpdate } from '../../database/types.js';

describe('GoldenAnswerRepository', () => {
  let repository: GoldenAnswerRepository;
  let mockDb: any;
  const tenantId = 'test-tenant-id';
  const clusterId = 'test-cluster-id';

  beforeEach(() => {
    // Create mock database
    mockDb = {
      selectFrom: vi.fn().mockReturnThis(),
      selectAll: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      insertInto: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      updateTable: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      deleteFrom: vi.fn().mockReturnThis(),
      execute: vi.fn(),
      executeTakeFirst: vi.fn(),
      executeTakeFirstOrThrow: vi.fn(),
    };

    repository = new GoldenAnswerRepository(mockDb);
  });

  describe('create', () => {
    it('should create a new golden answer', async () => {
      const newAnswer: NewGoldenAnswer = {
        cluster_id: clusterId,
        tenant_id: tenantId,
        answer: 'To get started, follow these steps...',
        answer_format: 'markdown',
        created_by: 'admin',
      };

      const mockCreatedAnswer = {
        id: 'generated-id',
        ...newAnswer,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockDb.execute.mockResolvedValueOnce({});
      mockDb.executeTakeFirstOrThrow.mockResolvedValueOnce(mockCreatedAnswer);

      const result = await repository.create(newAnswer);

      expect(result).toBeDefined();
      expect(result.cluster_id).toBe(clusterId);
      expect(result.tenant_id).toBe(tenantId);
      expect(result.answer).toBe(newAnswer.answer);
      expect(result.answer_format).toBe('markdown');
      expect(result.created_by).toBe('admin');
      
      expect(mockDb.insertInto).toHaveBeenCalledWith('golden_answers');
      expect(mockDb.values).toHaveBeenCalled();
    });

    it('should use default answer_format if not provided', async () => {
      const newAnswer: NewGoldenAnswer = {
        cluster_id: clusterId,
        tenant_id: tenantId,
        answer: 'Plain text answer',
        created_by: 'admin',
      };

      const mockCreatedAnswer = {
        id: 'generated-id',
        ...newAnswer,
        answer_format: 'markdown',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockDb.execute.mockResolvedValueOnce({});
      mockDb.executeTakeFirstOrThrow.mockResolvedValueOnce(mockCreatedAnswer);

      const result = await repository.create(newAnswer);

      expect(result.answer_format).toBe('markdown');
    });
  });

  describe('findByClusterId', () => {
    it('should find golden answer by cluster ID', async () => {
      const mockAnswer = {
        id: 'answer-id',
        cluster_id: clusterId,
        tenant_id: tenantId,
        answer: 'Test answer',
        answer_format: 'markdown',
        created_by: 'admin',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockDb.executeTakeFirst.mockResolvedValueOnce(mockAnswer);

      const found = await repository.findByClusterId(clusterId);

      expect(found).toBeDefined();
      expect(found?.cluster_id).toBe(clusterId);
      expect(found?.answer).toBe('Test answer');
      
      expect(mockDb.selectFrom).toHaveBeenCalledWith('golden_answers');
      expect(mockDb.where).toHaveBeenCalledWith('cluster_id', '=', clusterId);
    });

    it('should return null for non-existent cluster ID', async () => {
      mockDb.executeTakeFirst.mockResolvedValueOnce(undefined);

      const found = await repository.findByClusterId('non-existent');
      
      expect(found).toBeNull();
    });
  });

  describe('findByTenantId', () => {
    it('should find all golden answers for a tenant with pagination', async () => {
      const mockAnswers = [
        {
          id: 'answer-1',
          cluster_id: 'cluster-1',
          tenant_id: tenantId,
          answer: 'Answer 1',
          answer_format: 'markdown',
          created_by: 'admin',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'answer-2',
          cluster_id: 'cluster-2',
          tenant_id: tenantId,
          answer: 'Answer 2',
          answer_format: 'markdown',
          created_by: 'admin',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      mockDb.execute.mockResolvedValueOnce(mockAnswers);
      mockDb.executeTakeFirst.mockResolvedValueOnce({ count: 2 });

      const result = await repository.findByTenantId(tenantId);

      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.totalPages).toBe(1);
      
      expect(mockDb.where).toHaveBeenCalledWith('tenant_id', '=', tenantId);
    });

    it('should handle pagination parameters correctly', async () => {
      mockDb.execute.mockResolvedValueOnce([]);
      mockDb.executeTakeFirst.mockResolvedValueOnce({ count: 25 });

      const result = await repository.findByTenantId(tenantId, {
        page: 2,
        limit: 10,
        sortBy: 'created_at',
        sortOrder: 'asc',
      });

      expect(result.pagination.totalPages).toBe(3);
      expect(mockDb.limit).toHaveBeenCalledWith(10);
      expect(mockDb.offset).toHaveBeenCalledWith(10);
      expect(mockDb.orderBy).toHaveBeenCalledWith('created_at', 'asc');
    });
  });

  describe('upsert', () => {
    it('should create new answer when none exists', async () => {
      const newAnswer: NewGoldenAnswer = {
        cluster_id: clusterId,
        tenant_id: tenantId,
        answer: 'New answer',
        created_by: 'admin',
      };

      // Mock findByClusterId returns null (no existing answer)
      mockDb.executeTakeFirst.mockResolvedValueOnce(undefined);
      
      // Mock create operation
      mockDb.execute.mockResolvedValueOnce({});
      mockDb.executeTakeFirstOrThrow.mockResolvedValueOnce({
        id: 'new-id',
        ...newAnswer,
        answer_format: 'markdown',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const result = await repository.upsert(newAnswer);

      expect(result).toBeDefined();
      expect(result.answer).toBe('New answer');
      expect(mockDb.insertInto).toHaveBeenCalled();
    });

    it('should update existing answer', async () => {
      const existingAnswer = {
        id: 'existing-id',
        cluster_id: clusterId,
        tenant_id: tenantId,
        answer: 'Original answer',
        answer_format: 'markdown',
        created_by: 'admin',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const updateData: NewGoldenAnswer = {
        cluster_id: clusterId,
        tenant_id: tenantId,
        answer: 'Updated answer',
        answer_format: 'plaintext',
        created_by: 'editor',
      };

      // Mock findByClusterId returns existing answer
      mockDb.executeTakeFirst.mockResolvedValueOnce(existingAnswer);
      
      // Mock update operation
      mockDb.execute.mockResolvedValueOnce({});
      mockDb.executeTakeFirst.mockResolvedValueOnce({
        ...existingAnswer,
        answer: 'Updated answer',
        answer_format: 'plaintext',
        created_by: 'editor',
        updated_at: new Date().toISOString(),
      });

      const result = await repository.upsert(updateData);

      expect(result.answer).toBe('Updated answer');
      expect(result.answer_format).toBe('plaintext');
      expect(mockDb.updateTable).toHaveBeenCalledWith('golden_answers');
    });
  });

  describe('update', () => {
    it('should update golden answer fields', async () => {
      const updateData: GoldenAnswerUpdate = {
        answer: 'Updated answer',
        answer_format: 'plaintext',
      };

      const updatedAnswer = {
        id: 'answer-id',
        cluster_id: clusterId,
        tenant_id: tenantId,
        answer: 'Updated answer',
        answer_format: 'plaintext',
        created_by: 'admin',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockDb.execute.mockResolvedValueOnce({});
      mockDb.executeTakeFirst.mockResolvedValueOnce(updatedAnswer);

      const result = await repository.update('answer-id', updateData);

      expect(result).toBeDefined();
      expect(result?.answer).toBe('Updated answer');
      expect(result?.answer_format).toBe('plaintext');
      
      expect(mockDb.updateTable).toHaveBeenCalledWith('golden_answers');
      expect(mockDb.where).toHaveBeenCalledWith('id', '=', 'answer-id');
    });

    it('should return null if answer not found', async () => {
      mockDb.execute.mockResolvedValueOnce({});
      mockDb.executeTakeFirst.mockResolvedValueOnce(undefined);

      const result = await repository.update('non-existent', { answer: 'New' });

      expect(result).toBeNull();
    });
  });

  describe('deleteByClusterId', () => {
    it('should delete golden answer by cluster ID', async () => {
      mockDb.executeTakeFirst.mockResolvedValueOnce({ numDeletedRows: 1 });

      const deleted = await repository.deleteByClusterId(clusterId);

      expect(deleted).toBe(true);
      expect(mockDb.deleteFrom).toHaveBeenCalledWith('golden_answers');
      expect(mockDb.where).toHaveBeenCalledWith('cluster_id', '=', clusterId);
    });

    it('should return false for non-existent cluster', async () => {
      mockDb.executeTakeFirst.mockResolvedValueOnce({ numDeletedRows: 0 });

      const deleted = await repository.deleteByClusterId('non-existent');

      expect(deleted).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete golden answer by ID', async () => {
      mockDb.executeTakeFirst.mockResolvedValueOnce({ numDeletedRows: 1 });

      const deleted = await repository.delete('answer-id');

      expect(deleted).toBe(true);
      expect(mockDb.deleteFrom).toHaveBeenCalledWith('golden_answers');
      expect(mockDb.where).toHaveBeenCalledWith('id', '=', 'answer-id');
    });

    it('should return false if answer not found', async () => {
      mockDb.executeTakeFirst.mockResolvedValueOnce({ numDeletedRows: 0 });

      const deleted = await repository.delete('non-existent');

      expect(deleted).toBe(false);
    });
  });

  describe('findWithClusterDetails', () => {
    it('should return golden answers with cluster information', async () => {
      const mockData = [
        {
          id: 'answer-1',
          cluster_id: 'cluster-1',
          tenant_id: tenantId,
          answer: 'Detailed answer',
          answer_format: 'markdown',
          created_by: 'admin',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          representative_text: 'How do I get started?',
          thread_title: 'Getting Started Guide',
          instance_count: 10,
          first_seen_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
        },
      ];

      mockDb.execute.mockResolvedValueOnce(mockData);
      mockDb.executeTakeFirst.mockResolvedValueOnce({ count: 1 });

      const result = await repository.findWithClusterDetails(tenantId);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].answer).toBe('Detailed answer');
      expect(result.data[0].cluster).toBeDefined();
      expect(result.data[0].cluster.representative_text).toBe('How do I get started?');
      expect(result.data[0].cluster.instance_count).toBe(10);
      
      expect(mockDb.innerJoin).toHaveBeenCalledWith(
        'question_clusters',
        'golden_answers.cluster_id',
        'question_clusters.id'
      );
    });

    it('should sort by instance count by default', async () => {
      mockDb.execute.mockResolvedValueOnce([]);
      mockDb.executeTakeFirst.mockResolvedValueOnce({ count: 0 });

      await repository.findWithClusterDetails(tenantId);

      expect(mockDb.orderBy).toHaveBeenCalledWith('question_clusters.instance_count', 'desc');
    });

    it('should allow custom sorting', async () => {
      mockDb.execute.mockResolvedValueOnce([]);
      mockDb.executeTakeFirst.mockResolvedValueOnce({ count: 0 });

      await repository.findWithClusterDetails(tenantId, {
        page: 1,
        limit: 10,
        sortBy: 'first_seen_at',
        sortOrder: 'asc',
      });

      expect(mockDb.orderBy).toHaveBeenCalledWith('question_clusters.first_seen_at', 'asc');
    });
  });
});