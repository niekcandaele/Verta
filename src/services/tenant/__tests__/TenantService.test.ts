/**
 * Tests for TenantService
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { TenantServiceImpl } from '../TenantServiceImpl.js';
import { TenantRepositoryImpl } from '../../../repositories/tenant/TenantRepositoryImpl.js';
import { createTestDatabase, destroyTestDatabase } from '../../../test/testcontainers-setup.js';
import type { TestDatabaseContext } from '../../../test/testcontainers-setup.js';
import type { CreateTenantInput, UpdateTenantInput } from '../../../validation/tenant/index.js';
import type { Tenant } from '../../../repositories/tenant/types.js';

describe('TenantService', () => {
  let context: TestDatabaseContext;
  let service: TenantServiceImpl;
  let repository: TenantRepositoryImpl;

  beforeEach(async () => {
    // Create fresh test database
    context = await createTestDatabase();
    repository = new TenantRepositoryImpl(context.db);
    service = new TenantServiceImpl(repository);

    // Clean up any existing data
    await context.cleanup();
  });

  afterAll(async () => {
    if (context) {
      await destroyTestDatabase(context);
    }
  });

  describe('create', () => {
    it('should create a tenant with valid data', async () => {
      const createData: CreateTenantInput = {
        name: 'Test Company',
        slug: 'test-company',
        platform: 'slack',
        platformId: 'T123456',
      };

      const result = await service.create(createData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Test Company');
        expect(result.data.slug).toBe('test-company');
        expect(result.data.platform).toBe('slack');
        expect(result.data.platformId).toBe('T123456');
        expect(result.data.status).toBe('ACTIVE'); // Default status
      }
    });

    it('should generate slug if not provided', async () => {
      const createData: CreateTenantInput = {
        name: 'My Awesome Company!!!',
        platform: 'discord',
        platformId: 'G987654',
      } as any; // Using any to bypass TypeScript validation for testing

      const result = await service.create(createData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.slug).toBe('my-awesome-company');
      }
    });

    it('should validate required fields', async () => {
      const invalidData = {
        name: 'Test',
        // Missing platform and platformId
      } as any;

      const result = await service.create(invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('VALIDATION_ERROR');
        expect(result.error.message).toContain('platform');
      }
    });

    it('should validate slug format', async () => {
      const createData: CreateTenantInput = {
        name: 'Test Company',
        slug: 'Invalid Slug!',
        platform: 'slack',
        platformId: 'T123456',
      };

      const result = await service.create(createData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('VALIDATION_ERROR');
        expect(result.error.message).toContain('slug');
      }
    });

    it('should enforce unique slug constraint', async () => {
      const createData: CreateTenantInput = {
        name: 'Test Company',
        slug: 'unique-slug',
        platform: 'slack',
        platformId: 'T123456',
      };

      // Create first tenant
      const result1 = await service.create(createData);
      expect(result1.success).toBe(true);

      // Try to create second tenant with same slug
      const result2 = await service.create({
        ...createData,
        platformId: 'T999999', // Different platform ID
      });

      expect(result2.success).toBe(false);
      if (!result2.success) {
        expect(result2.error.type).toBe('DUPLICATE_ENTRY');
        expect(result2.error.message).toContain('already exists');
      }
    });

    it('should enforce unique platform + platformId constraint', async () => {
      const createData: CreateTenantInput = {
        name: 'Test Company',
        slug: 'test-company-1',
        platform: 'slack',
        platformId: 'T123456',
      };

      // Create first tenant
      const result1 = await service.create(createData);
      expect(result1.success).toBe(true);

      // Try to create second tenant with same platform + platformId
      const result2 = await service.create({
        ...createData,
        name: 'Different Company',
        slug: 'different-slug',
      });

      expect(result2.success).toBe(false);
      if (!result2.success) {
        expect(result2.error.type).toBe('DUPLICATE_ENTRY');
        expect(result2.error.message).toContain('already exists');
      }
    });
  });

  describe('update', () => {
    let existingTenant: Tenant;

    beforeEach(async () => {
      // Create a tenant to update
      const createResult = await service.create({
        name: 'Original Company',
        slug: 'original-company',
        platform: 'slack',
        platformId: 'T111111',
      });
      
      if (!createResult.success) {
        throw new Error('Failed to create test tenant');
      }
      existingTenant = createResult.data;
    });

    it('should update tenant with valid data', async () => {
      const updateData: UpdateTenantInput = {
        name: 'Updated Company',
        status: 'MAINTENANCE',
      };

      const result = await service.update(existingTenant.id, updateData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Updated Company');
        expect(result.data.status).toBe('MAINTENANCE');
        expect(result.data.slug).toBe('original-company'); // Unchanged
      }
    });

    it('should validate updated fields', async () => {
      const updateData: UpdateTenantInput = {
        platform: 'invalid' as any,
      };

      const result = await service.update(existingTenant.id, updateData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('VALIDATION_ERROR');
      }
    });

    it('should enforce unique slug when updating', async () => {
      // Create another tenant
      const otherResult = await service.create({
        name: 'Other Company',
        slug: 'other-company',
        platform: 'discord',
        platformId: 'G222222',
      });

      if (!otherResult.success) {
        throw new Error('Failed to create other tenant');
      }

      // Try to update first tenant with second tenant's slug
      const result = await service.update(existingTenant.id, {
        slug: 'other-company',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('DUPLICATE_ENTRY');
        expect(result.error.message).toContain('already exists');
      }
    });

    it('should allow updating to same values', async () => {
      const result = await service.update(existingTenant.id, {
        slug: existingTenant.slug,
        platform: existingTenant.platform,
        platformId: existingTenant.platformId,
      });

      expect(result.success).toBe(true);
    });

    it('should return not found for non-existent tenant', async () => {
      // Use a valid UUID that doesn't exist
      const result = await service.update('123e4567-e89b-12d3-a456-426614174000', {
        name: 'Updated',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('NOT_FOUND');
      }
    });
  });

  describe('findBySlug', () => {
    beforeEach(async () => {
      await service.create({
        name: 'Find Me Company',
        slug: 'find-me',
        platform: 'slack',
        platformId: 'T333333',
      });
    });

    it('should find tenant by slug', async () => {
      const result = await service.findBySlug('find-me');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.slug).toBe('find-me');
        expect(result.data.name).toBe('Find Me Company');
      }
    });

    it('should return not found for non-existent slug', async () => {
      const result = await service.findBySlug('non-existent');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('NOT_FOUND');
        expect(result.error.message).toContain("slug 'non-existent'");
      }
    });
  });

  describe('findByPlatformId', () => {
    beforeEach(async () => {
      await service.create({
        name: 'Discord Company',
        slug: 'discord-company',
        platform: 'discord',
        platformId: 'G444444',
      });
    });

    it('should find tenant by platform and ID', async () => {
      const result = await service.findByPlatformId('discord', 'G444444');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.platform).toBe('discord');
        expect(result.data.platformId).toBe('G444444');
        expect(result.data.name).toBe('Discord Company');
      }
    });

    it('should return not found for non-existent combination', async () => {
      const result = await service.findByPlatformId('slack', 'G444444');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('NOT_FOUND');
        expect(result.error.message).toContain("platform 'slack' with ID 'G444444'");
      }
    });
  });

  describe('generateSlug', () => {
    it('should generate valid slugs from various inputs', () => {
      const testCases = [
        { input: 'Simple Name', expected: 'simple-name' },
        { input: 'Company 123', expected: 'company-123' },
        { input: '  Spaces  Around  ', expected: 'spaces-around' },
        { input: 'Special!@#$%Characters', expected: 'special-characters' },
        { input: 'Multiple---Hyphens', expected: 'multiple-hyphens' },
        { input: '123 Numbers First', expected: '123-numbers-first' },
        { input: 'UPPERCASE LETTERS', expected: 'uppercase-letters' },
        { input: 'Über Ñice Çompany', expected: 'ber-ice-ompany' }, // Non-ASCII removed
        { input: 'A'.repeat(100), expected: 'a'.repeat(50) }, // Length limit
      ];

      testCases.forEach(({ input, expected }) => {
        const result = service.generateSlug(input);
        expect(result).toBe(expected);
      });
    });
  });

  describe('CRUD operations inherited from base service', () => {
    it('should list all tenants with pagination', async () => {
      // Create multiple tenants
      for (let i = 1; i <= 5; i++) {
        await service.create({
          name: `Company ${i}`,
          slug: `company-${i}`,
          platform: 'slack',
          platformId: `T${i}00000`,
        });
      }

      const result = await service.findAll({ page: 1, limit: 3 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.data).toHaveLength(3);
        expect(result.data.pagination.total).toBe(5);
        expect(result.data.pagination.totalPages).toBe(2);
      }
    });

    it('should find tenant by ID', async () => {
      const createResult = await service.create({
        name: 'Find By ID Company',
        slug: 'find-by-id',
        platform: 'discord',
        platformId: 'G555555',
      });

      if (!createResult.success) {
        throw new Error('Failed to create tenant');
      }

      const result = await service.findById(createResult.data.id);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(createResult.data.id);
        expect(result.data.name).toBe('Find By ID Company');
      }
    });

    it('should delete tenant', async () => {
      const createResult = await service.create({
        name: 'Delete Me Company',
        slug: 'delete-me',
        platform: 'slack',
        platformId: 'T666666',
      });

      if (!createResult.success) {
        throw new Error('Failed to create tenant');
      }

      const deleteResult = await service.delete(createResult.data.id);
      expect(deleteResult.success).toBe(true);

      // Verify it's deleted
      const findResult = await service.findById(createResult.data.id);
      expect(findResult.success).toBe(false);
      if (!findResult.success) {
        expect(findResult.error.type).toBe('NOT_FOUND');
      }
    });
  });
});