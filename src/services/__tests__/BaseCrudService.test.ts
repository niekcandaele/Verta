/**
 * Tests for BaseCrudService
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseCrudServiceImpl } from '../BaseCrudService.js';
import type { BaseCrudRepository, PaginatedResult } from '../../repositories/types.js';

// Test entity type
interface TestEntity {
  id: string;
  name: string;
  value: number;
}

// Test data types
interface CreateTestData {
  name: string;
  value: number;
}

interface UpdateTestData {
  name?: string;
  value?: number;
}

// Test service implementation
class TestService extends BaseCrudServiceImpl<TestEntity, CreateTestData, UpdateTestData> {}

describe('BaseCrudService', () => {
  let mockRepository: BaseCrudRepository<TestEntity, CreateTestData, UpdateTestData>;
  let service: TestService;

  const testEntity: TestEntity = {
    id: '123',
    name: 'Test Entity',
    value: 42,
  };

  beforeEach(() => {
    // Reset all mocks
    mockRepository = {
      findAll: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    service = new TestService(mockRepository);
  });

  describe('findAll', () => {
    it('should return success result with paginated data', async () => {
      const paginatedResult: PaginatedResult<TestEntity> = {
        data: [testEntity],
        total: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      };

      vi.mocked(mockRepository.findAll).mockResolvedValue(paginatedResult);

      const result = await service.findAll({ page: 1, pageSize: 10 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(paginatedResult);
      }
      expect(mockRepository.findAll).toHaveBeenCalledWith({ page: 1, pageSize: 10 });
    });

    it('should handle repository errors', async () => {
      vi.mocked(mockRepository.findAll).mockRejectedValue(new Error('Database error'));

      const result = await service.findAll();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('DATABASE_ERROR');
        expect(result.error.message).toBe('Database operation failed');
      }
    });
  });

  describe('findById', () => {
    it('should return success result when entity exists', async () => {
      vi.mocked(mockRepository.findById).mockResolvedValue(testEntity);

      const result = await service.findById('123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(testEntity);
      }
      expect(mockRepository.findById).toHaveBeenCalledWith('123');
    });

    it('should return not found error when entity does not exist', async () => {
      vi.mocked(mockRepository.findById).mockResolvedValue(null);

      const result = await service.findById('999');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('NOT_FOUND');
        expect(result.error.message).toBe('Entity with ID 999 not found');
      }
    });

    it('should handle repository errors', async () => {
      vi.mocked(mockRepository.findById).mockRejectedValue(new Error('Connection error'));

      const result = await service.findById('123');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('DATABASE_ERROR');
      }
    });
  });

  describe('create', () => {
    const createData: CreateTestData = { name: 'New Entity', value: 100 };

    it('should create entity successfully', async () => {
      vi.mocked(mockRepository.create).mockResolvedValue(testEntity);

      const result = await service.create(createData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(testEntity);
      }
      expect(mockRepository.create).toHaveBeenCalledWith(createData);
    });


    it('should handle duplicate key errors', async () => {
      vi.mocked(mockRepository.create).mockRejectedValue(
        new Error('duplicate key value violates unique constraint')
      );

      const result = await service.create(createData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('DUPLICATE_ENTRY');
        expect(result.error.message).toBe('A record with this value already exists');
      }
    });

  });

  describe('update', () => {
    const updateData: UpdateTestData = { name: 'Updated Entity' };

    it('should update entity successfully', async () => {
      const updatedEntity = { ...testEntity, ...updateData };
      vi.mocked(mockRepository.update).mockResolvedValue(updatedEntity);

      const result = await service.update('123', updateData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(updatedEntity);
      }
      expect(mockRepository.update).toHaveBeenCalledWith('123', updateData);
    });

    it('should return not found when entity does not exist', async () => {
      vi.mocked(mockRepository.update).mockResolvedValue(null);

      const result = await service.update('999', updateData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('NOT_FOUND');
        expect(result.error.message).toBe('Entity with ID 999 not found');
      }
    });

    it('should handle repository errors', async () => {
      vi.mocked(mockRepository.update).mockRejectedValue(
        new Error('foreign key constraint violation')
      );

      const result = await service.update('123', updateData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('BUSINESS_RULE_VIOLATION');
        expect(result.error.message).toBe('Operation violates referential integrity');
      }
    });
  });

  describe('delete', () => {
    it('should delete entity successfully', async () => {
      vi.mocked(mockRepository.delete).mockResolvedValue(true);

      const result = await service.delete('123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
      expect(mockRepository.delete).toHaveBeenCalledWith('123');
    });

    it('should return not found when entity does not exist', async () => {
      vi.mocked(mockRepository.delete).mockResolvedValue(false);

      const result = await service.delete('999');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('NOT_FOUND');
        expect(result.error.message).toBe('Entity with ID 999 not found');
      }
    });

    it('should handle repository errors', async () => {
      vi.mocked(mockRepository.delete).mockRejectedValue(new Error('Database locked'));

      const result = await service.delete('123');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('DATABASE_ERROR');
      }
    });
  });

  describe('error handling', () => {
    it('should handle unknown errors', async () => {
      vi.mocked(mockRepository.findAll).mockRejectedValue('Unknown error');

      const result = await service.findAll();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('INTERNAL_ERROR');
        expect(result.error.message).toBe('An unexpected error occurred');
      }
    });

    it('should detect various database errors correctly', async () => {
      const errorCases = [
        {
          error: new Error('unique constraint "uk_tenant_slug" violated'),
          expectedType: 'DUPLICATE_ENTRY',
        },
        {
          error: new Error('violates foreign key constraint'),
          expectedType: 'BUSINESS_RULE_VIOLATION',
        },
        {
          error: new Error('database connection lost'),
          expectedType: 'DATABASE_ERROR',
        },
        {
          error: new Error('something went wrong'),
          expectedType: 'INTERNAL_ERROR',
        },
      ];

      for (const { error, expectedType } of errorCases) {
        vi.mocked(mockRepository.findAll).mockRejectedValue(error);
        
        const result = await service.findAll();
        
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe(expectedType);
        }
      }
    });
  });
});