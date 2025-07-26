import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { TenantRepositoryImpl } from '../TenantRepositoryImpl.js';
import {
  createTestDatabase,
  destroyTestDatabase,
  type TestDatabaseContext,
} from '../../../test/testcontainers-setup.js';
import type { CreateTenantData, UpdateTenantData } from '../types.js';

describe('TenantRepository', () => {
  let testContext: TestDatabaseContext;
  let repository: TenantRepositoryImpl;

  beforeAll(async () => {
    // Create test database with migrations
    testContext = await createTestDatabase();

    // Create repository instance
    repository = new TenantRepositoryImpl(testContext.db);
  });

  afterAll(async () => {
    await destroyTestDatabase(testContext);
  });

  beforeEach(async () => {
    // Clear test data using the cleanup function
    await testContext.cleanup();
  });

  describe('create', () => {
    it('should create a new tenant', async () => {
      const createData: CreateTenantData = {
        name: 'Acme Corp',
        slug: 'acme-corp',
        platform: 'slack',
        platformId: 'T1234567890',
      };

      const tenant = await repository.create(createData);

      expect(tenant).toMatchObject({
        name: 'Acme Corp',
        slug: 'acme-corp',
        status: 'ACTIVE',
        platform: 'slack',
        platformId: 'T1234567890',
      });
      expect(tenant.id).toBeDefined();
      expect(tenant.createdAt).toBeInstanceOf(Date);
      expect(tenant.updatedAt).toBeInstanceOf(Date);
    });

    it('should create tenant with custom status', async () => {
      const createData: CreateTenantData = {
        name: 'Beta Corp',
        slug: 'beta-corp',
        platform: 'discord',
        platformId: '987654321',
        status: 'MAINTENANCE',
      };

      const tenant = await repository.create(createData);

      expect(tenant.status).toBe('MAINTENANCE');
    });

    it('should fail on duplicate slug', async () => {
      const createData: CreateTenantData = {
        name: 'First Corp',
        slug: 'duplicate-slug',
        platform: 'slack',
        platformId: 'T111',
      };

      await repository.create(createData);

      // Try to create another with same slug
      const duplicateData: CreateTenantData = {
        name: 'Second Corp',
        slug: 'duplicate-slug',
        platform: 'discord',
        platformId: '222',
      };

      await expect(repository.create(duplicateData)).rejects.toThrow();
    });

    it('should fail on duplicate platform and platformId', async () => {
      const createData: CreateTenantData = {
        name: 'First Corp',
        slug: 'first-corp',
        platform: 'slack',
        platformId: 'T_DUPLICATE',
      };

      await repository.create(createData);

      // Try to create another with same platform and platformId
      const duplicateData: CreateTenantData = {
        name: 'Second Corp',
        slug: 'second-corp',
        platform: 'slack',
        platformId: 'T_DUPLICATE',
      };

      await expect(repository.create(duplicateData)).rejects.toThrow();
    });
  });

  describe('findById', () => {
    it('should find tenant by id', async () => {
      const created = await repository.create({
        name: 'Test Corp',
        slug: 'test-corp',
        platform: 'slack',
        platformId: 'T123',
      });

      const found = await repository.findById(created.id);

      expect(found).toEqual(created);
    });

    it('should return null for non-existent id', async () => {
      const found = await repository.findById(
        '00000000-0000-0000-0000-000000000000'
      );

      expect(found).toBeNull();
    });
  });

  describe('findBySlug', () => {
    it('should find tenant by slug', async () => {
      const created = await repository.create({
        name: 'Slug Test Corp',
        slug: 'slug-test',
        platform: 'discord',
        platformId: '12345',
      });

      const found = await repository.findBySlug('slug-test');

      expect(found).toEqual(created);
    });

    it('should return null for non-existent slug', async () => {
      const found = await repository.findBySlug('does-not-exist');

      expect(found).toBeNull();
    });

    it('should be case sensitive', async () => {
      await repository.create({
        name: 'Case Test',
        slug: 'case-test',
        platform: 'slack',
        platformId: 'T999',
      });

      const found = await repository.findBySlug('CASE-TEST');

      expect(found).toBeNull();
    });
  });

  describe('findByPlatformId', () => {
    it('should find tenant by platform and platformId', async () => {
      const created = await repository.create({
        name: 'Platform Test',
        slug: 'platform-test',
        platform: 'slack',
        platformId: 'T_PLATFORM_TEST',
      });

      const found = await repository.findByPlatformId(
        'slack',
        'T_PLATFORM_TEST'
      );

      expect(found).toEqual(created);
    });

    it('should return null for non-existent combination', async () => {
      await repository.create({
        name: 'Discord Test',
        slug: 'discord-test',
        platform: 'discord',
        platformId: '999888777',
      });

      // Wrong platform
      const found1 = await repository.findByPlatformId('slack', '999888777');
      expect(found1).toBeNull();

      // Wrong platformId
      const found2 = await repository.findByPlatformId('discord', 'WRONG_ID');
      expect(found2).toBeNull();
    });

    it('should distinguish between platforms', async () => {
      // Create two tenants with same platformId but different platforms
      const slackTenant = await repository.create({
        name: 'Slack Tenant',
        slug: 'slack-tenant',
        platform: 'slack',
        platformId: 'SAME_ID',
      });

      const discordTenant = await repository.create({
        name: 'Discord Tenant',
        slug: 'discord-tenant',
        platform: 'discord',
        platformId: 'SAME_ID',
      });

      const foundSlack = await repository.findByPlatformId('slack', 'SAME_ID');
      const foundDiscord = await repository.findByPlatformId(
        'discord',
        'SAME_ID'
      );

      expect(foundSlack).toEqual(slackTenant);
      expect(foundDiscord).toEqual(discordTenant);
    });
  });

  describe('findAll', () => {
    beforeEach(async () => {
      // Create test tenants
      const tenants = [
        {
          name: 'Alpha Corp',
          slug: 'alpha-corp',
          platform: 'slack' as const,
          platformId: 'T001',
        },
        {
          name: 'Beta Corp',
          slug: 'beta-corp',
          platform: 'discord' as const,
          platformId: 'D001',
        },
        {
          name: 'Gamma Corp',
          slug: 'gamma-corp',
          platform: 'slack' as const,
          platformId: 'T002',
        },
      ];

      for (const tenant of tenants) {
        await repository.create(tenant);
      }
    });

    it('should return paginated results', async () => {
      const result = await repository.findAll({ page: 1, limit: 2 });

      expect(result.data).toHaveLength(2);
      expect(result.pagination).toMatchObject({
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2,
      });
    });

    it('should support sorting', async () => {
      const result = await repository.findAll({
        sortBy: 'name',
        sortOrder: 'asc',
      });

      expect(result.data[0].name).toBe('Alpha Corp');
      expect(result.data[1].name).toBe('Beta Corp');
      expect(result.data[2].name).toBe('Gamma Corp');
    });
  });

  describe('update', () => {
    it('should update tenant fields', async () => {
      const created = await repository.create({
        name: 'Original Name',
        slug: 'original-slug',
        platform: 'slack',
        platformId: 'T_UPDATE',
        status: 'ACTIVE',
      });

      // Wait to ensure different timestamp
      await new Promise((resolve) => global.setTimeout(resolve, 100));

      const updateData: UpdateTenantData = {
        name: 'Updated Name',
        status: 'MAINTENANCE',
      };

      const updated = await repository.update(created.id, updateData);

      expect(updated).toMatchObject({
        id: created.id,
        name: 'Updated Name',
        slug: 'original-slug',
        status: 'MAINTENANCE',
        platform: 'slack',
        platformId: 'T_UPDATE',
      });
      expect(updated!.updatedAt.getTime()).toBeGreaterThan(
        created.updatedAt.getTime()
      );
    });

    it('should update slug', async () => {
      const created = await repository.create({
        name: 'Slug Update Test',
        slug: 'old-slug',
        platform: 'discord',
        platformId: 'D_SLUG',
      });

      const updated = await repository.update(created.id, {
        slug: 'new-slug',
      });

      expect(updated!.slug).toBe('new-slug');

      // Verify old slug no longer works
      const oldSlugResult = await repository.findBySlug('old-slug');
      expect(oldSlugResult).toBeNull();

      // Verify new slug works
      const newSlugResult = await repository.findBySlug('new-slug');
      expect(newSlugResult).toEqual(updated);
    });

    it('should fail when updating to duplicate slug', async () => {
      await repository.create({
        name: 'First',
        slug: 'existing-slug',
        platform: 'slack',
        platformId: 'T_FIRST',
      });

      const second = await repository.create({
        name: 'Second',
        slug: 'second-slug',
        platform: 'discord',
        platformId: 'D_SECOND',
      });

      await expect(
        repository.update(second.id, { slug: 'existing-slug' })
      ).rejects.toThrow();
    });

    it('should return null for non-existent id', async () => {
      const updated = await repository.update(
        '00000000-0000-0000-0000-000000000000',
        { name: 'Updated' }
      );

      expect(updated).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete an existing tenant', async () => {
      const created = await repository.create({
        name: 'To Delete',
        slug: 'to-delete',
        platform: 'slack',
        platformId: 'T_DELETE',
      });

      const deleted = await repository.delete(created.id);
      expect(deleted).toBe(true);

      const found = await repository.findById(created.id);
      expect(found).toBeNull();
    });

    it('should return false for non-existent id', async () => {
      const deleted = await repository.delete(
        '00000000-0000-0000-0000-000000000000'
      );

      expect(deleted).toBe(false);
    });
  });

  describe('data mapping', () => {
    it('should correctly map snake_case to camelCase', async () => {
      const created = await repository.create({
        name: 'Mapping Test',
        slug: 'mapping-test',
        platform: 'discord',
        platformId: 'D_MAPPING',
      });

      // Verify all fields are camelCase
      expect(created).toHaveProperty('platformId');
      expect(created).toHaveProperty('createdAt');
      expect(created).toHaveProperty('updatedAt');

      // Should not have snake_case properties
      expect(created).not.toHaveProperty('platform_id');
      expect(created).not.toHaveProperty('created_at');
      expect(created).not.toHaveProperty('updated_at');
    });
  });
});
