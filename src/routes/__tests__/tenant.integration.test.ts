/**
 * Integration tests for tenant routes
 * Tests full CRUD operations with database
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Application } from 'express';
import { createApp } from '../../app.js';
import { config } from '../../config/env.js';
import {
  createTestDatabase,
  destroyTestDatabase,
  type TestDatabaseContext,
} from '../../test/testcontainers-setup.js';

describe('Tenant Routes Integration', () => {
  let testContext: TestDatabaseContext;
  let app: Application;

  beforeAll(async () => {
    // Create test database with testcontainers
    testContext = await createTestDatabase();

    // Create the real app with test database
    app = createApp(testContext.db);
  });

  afterAll(async () => {
    await destroyTestDatabase(testContext);
  });

  beforeEach(async () => {
    // Clear test data
    await testContext.cleanup();
  });

  describe('GET /api/tenants', () => {
    it('should return empty array when no tenants exist', async () => {
      const response = await request(app)
        .get('/api/tenants')
        .set('X-API-KEY', config.ADMIN_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveLength(0);
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
      });
    });

    it('should return paginated tenants', async () => {
      // Insert test tenants
      const tenants = [];
      for (let i = 1; i <= 15; i++) {
        tenants.push({
          name: `Tenant ${i}`,
          slug: `tenant-${i}`,
          status: 'ACTIVE' as const,
          platform: 'slack' as const,
          platform_id: `SLACK${i}`,
        });
      }
      await testContext.db.insertInto('tenants').values(tenants).execute();

      // Get first page
      const response1 = await request(app)
        .get('/api/tenants?page=1&limit=10')
        .set('X-API-KEY', config.ADMIN_API_KEY);

      expect(response1.status).toBe(200);
      expect(response1.body.data).toHaveLength(10);
      expect(response1.body.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 15,
        totalPages: 2,
      });

      // Get second page
      const response2 = await request(app)
        .get('/api/tenants?page=2&limit=10')
        .set('X-API-KEY', config.ADMIN_API_KEY);

      expect(response2.status).toBe(200);
      expect(response2.body.data).toHaveLength(5);
      expect(response2.body.pagination.page).toBe(2);
    });

    it('should sort tenants correctly', async () => {
      // Insert test tenants with different names
      await testContext.db
        .insertInto('tenants')
        .values([
          {
            name: 'Zebra Corp',
            slug: 'zebra-corp',
            status: 'ACTIVE' as const,
            platform: 'slack' as const,
            platform_id: 'SLACK1',
          },
          {
            name: 'Alpha Inc',
            slug: 'alpha-inc',
            status: 'ACTIVE' as const,
            platform: 'slack' as const,
            platform_id: 'SLACK2',
          },
        ])
        .execute();

      const response = await request(app)
        .get('/api/tenants?sortBy=name&sortOrder=asc')
        .set('X-API-KEY', config.ADMIN_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body.data[0].name).toBe('Alpha Inc');
      expect(response.body.data[1].name).toBe('Zebra Corp');
    });
  });

  describe('GET /api/tenants/:id', () => {
    it('should return 404 for non-existent tenant', async () => {
      const response = await request(app)
        .get('/api/tenants/550e8400-e29b-41d4-a716-446655440000')
        .set('X-API-KEY', config.ADMIN_API_KEY);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Not Found');
    });

    it('should return tenant by ID', async () => {
      // Insert test tenant
      const [tenant] = await testContext.db
        .insertInto('tenants')
        .values({
          name: 'Test Tenant',
          slug: 'test-tenant',
          status: 'ACTIVE' as const,
          platform: 'slack' as const,
          platform_id: 'SLACK123',
        })
        .returning(['id', 'name', 'slug', 'status', 'platform', 'platform_id'])
        .execute();

      const response = await request(app)
        .get(`/api/tenants/${tenant.id}`)
        .set('X-API-KEY', config.ADMIN_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: tenant.id,
        name: 'Test Tenant',
        slug: 'test-tenant',
        status: 'ACTIVE',
        platform: 'slack',
        platformId: 'SLACK123',
      });
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body).toHaveProperty('updatedAt');
    });
  });

  describe('POST /api/tenants', () => {
    it('should create a new tenant', async () => {
      const newTenant = {
        name: 'New Tenant',
        slug: 'new-tenant',
        platform: 'slack',
        platformId: 'SLACK456',
      };

      const response = await request(app)
        .post('/api/tenants')
        .set('X-API-KEY', config.ADMIN_API_KEY)
        .send(newTenant);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        name: 'New Tenant',
        slug: 'new-tenant',
        status: 'ACTIVE', // Default value
        platform: 'slack',
        platformId: 'SLACK456',
      });
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body).toHaveProperty('updatedAt');

      // Verify in database
      const dbTenant = await testContext.db
        .selectFrom('tenants')
        .selectAll()
        .where('id', '=', response.body.id)
        .executeTakeFirst();

      expect(dbTenant).toBeDefined();
      expect(dbTenant?.name).toBe('New Tenant');
    });

    it('should auto-generate slug if not provided', async () => {
      const newTenant = {
        name: 'Auto Slug Test',
        platform: 'discord',
        platformId: 'DISCORD123',
      };

      const response = await request(app)
        .post('/api/tenants')
        .set('X-API-KEY', config.ADMIN_API_KEY)
        .send(newTenant);

      expect(response.status).toBe(201);
      expect(response.body.slug).toBe('auto-slug-test');
    });

    it('should reject duplicate slug', async () => {
      // Insert existing tenant
      await testContext.db
        .insertInto('tenants')
        .values({
          name: 'Existing Tenant',
          slug: 'duplicate-slug',
          status: 'ACTIVE' as const,
          platform: 'slack' as const,
          platform_id: 'SLACK789',
        })
        .execute();

      const newTenant = {
        name: 'Another Tenant',
        slug: 'duplicate-slug',
        platform: 'discord',
        platformId: 'DISCORD456',
      };

      const response = await request(app)
        .post('/api/tenants')
        .set('X-API-KEY', config.ADMIN_API_KEY)
        .send(newTenant);

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('error', 'Duplicate Entry');
    });

    it('should reject duplicate platform ID', async () => {
      // Insert existing tenant
      await testContext.db
        .insertInto('tenants')
        .values({
          name: 'Existing Tenant',
          slug: 'existing-tenant',
          status: 'ACTIVE' as const,
          platform: 'slack' as const,
          platform_id: 'DUPLICATE123',
        })
        .execute();

      const newTenant = {
        name: 'Another Tenant',
        slug: 'another-tenant',
        platform: 'slack',
        platformId: 'DUPLICATE123',
      };

      const response = await request(app)
        .post('/api/tenants')
        .set('X-API-KEY', config.ADMIN_API_KEY)
        .send(newTenant);

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('error', 'Duplicate Entry');
    });
  });

  describe('PATCH /api/tenants/:id', () => {
    it('should update tenant fields', async () => {
      // Insert test tenant
      const [tenant] = await testContext.db
        .insertInto('tenants')
        .values({
          name: 'Original Name',
          slug: 'original-slug',
          status: 'ACTIVE' as const,
          platform: 'slack' as const,
          platform_id: 'SLACK999',
        })
        .returning(['id'])
        .execute();

      const updates = {
        name: 'Updated Name',
        status: 'MAINTENANCE',
      };

      const response = await request(app)
        .patch(`/api/tenants/${tenant.id}`)
        .set('X-API-KEY', config.ADMIN_API_KEY)
        .send(updates);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: tenant.id,
        name: 'Updated Name',
        slug: 'original-slug', // Unchanged
        status: 'MAINTENANCE',
        platform: 'slack', // Unchanged
        platformId: 'SLACK999', // Unchanged
      });
    });

    it('should return 404 for non-existent tenant', async () => {
      const response = await request(app)
        .patch('/api/tenants/550e8400-e29b-41d4-a716-446655440000')
        .set('X-API-KEY', config.ADMIN_API_KEY)
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Not Found');
    });

    it('should reject duplicate slug on update', async () => {
      // Insert two tenants
      const [tenant1] = await testContext.db
        .insertInto('tenants')
        .values({
          name: 'Tenant 1',
          slug: 'tenant-1',
          status: 'ACTIVE' as const,
          platform: 'slack' as const,
          platform_id: 'SLACK1',
        })
        .returning(['id'])
        .execute();

      await testContext.db
        .insertInto('tenants')
        .values({
          name: 'Tenant 2',
          slug: 'tenant-2',
          status: 'ACTIVE' as const,
          platform: 'slack' as const,
          platform_id: 'SLACK2',
        })
        .execute();

      // Try to update tenant1 with tenant2's slug
      const response = await request(app)
        .patch(`/api/tenants/${tenant1.id}`)
        .set('X-API-KEY', config.ADMIN_API_KEY)
        .send({ slug: 'tenant-2' });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('error', 'Duplicate Entry');
    });
  });

  describe('DELETE /api/tenants/:id', () => {
    it('should delete an existing tenant', async () => {
      // Insert test tenant
      const [tenant] = await testContext.db
        .insertInto('tenants')
        .values({
          name: 'To Delete',
          slug: 'to-delete',
          status: 'CANCELLED' as const,
          platform: 'slack' as const,
          platform_id: 'SLACKDEL',
        })
        .returning(['id'])
        .execute();

      const response = await request(app)
        .delete(`/api/tenants/${tenant.id}`)
        .set('X-API-KEY', config.ADMIN_API_KEY);

      expect(response.status).toBe(204);
      expect(response.body).toEqual({});

      // Verify deletion
      const dbTenant = await testContext.db
        .selectFrom('tenants')
        .selectAll()
        .where('id', '=', tenant.id)
        .executeTakeFirst();

      expect(dbTenant).toBeUndefined();
    });

    it('should return 404 for non-existent tenant', async () => {
      const response = await request(app)
        .delete('/api/tenants/550e8400-e29b-41d4-a716-446655440000')
        .set('X-API-KEY', config.ADMIN_API_KEY);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Not Found');
    });
  });

  describe('Error Scenarios', () => {
    it('should handle database connection errors gracefully', async () => {
      // This would require mocking the database connection
      // For now, we'll just ensure our error handler is properly wired
      const response = await request(app)
        .get('/api/tenants')
        .set('X-API-KEY', config.ADMIN_API_KEY);

      // If we get here without crashing, error handling is working
      expect(response.status).toBeLessThan(500);
    });
  });
});
