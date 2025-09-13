/**
 * Integration tests for admin knowledge base routes
 * Tests full CRUD workflow for knowledge base management
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Application } from 'express';
import { createApp } from '../../../../app.js';
import { v4 as uuidv4 } from 'uuid';
import type { Kysely } from 'kysely';
import type { Database } from '../../../../database/types.js';

// Mock database setup for testing
let app: Application;
let db: Kysely<Database>;
let testTenantId: string;
let testKnowledgeBaseId: string;

describe('Admin Knowledge Base API Integration', () => {
  beforeAll(async () => {
    // Use the existing database connection
    const { db: database } = await import('../../../../database/index.js');
    db = database;
    app = createApp(db);

    // Create test tenant
    testTenantId = uuidv4();
    await db
      .insertInto('tenants')
      .values({
        id: testTenantId,
        name: 'Test Tenant for KB',
        slug: 'test-kb-tenant',
        status: 'ACTIVE',
        platform: 'discord',
        platform_id: 'test-kb-platform-id',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();
  });

  afterAll(async () => {
    // Clean up test data
    if (testTenantId) {
      // Clean up any knowledge base chunks first
      await db
        .deleteFrom('knowledge_base_chunks')
        .where(
          'knowledge_base_id',
          'in',
          db
            .selectFrom('knowledge_bases')
            .select('id')
            .where('tenant_id', '=', testTenantId)
        )
        .execute();

      // Clean up knowledge bases
      await db
        .deleteFrom('knowledge_bases')
        .where('tenant_id', '=', testTenantId)
        .execute();

      // Clean up tenant
      await db.deleteFrom('tenants').where('id', '=', testTenantId).execute();
    }
  });

  beforeEach(async () => {
    // Clean up any existing knowledge bases before each test
    await db
      .deleteFrom('knowledge_base_chunks')
      .where(
        'knowledge_base_id',
        'in',
        db
          .selectFrom('knowledge_bases')
          .select('id')
          .where('tenant_id', '=', testTenantId)
      )
      .execute();
    
    await db
      .deleteFrom('knowledge_bases')
      .where('tenant_id', '=', testTenantId)
      .execute();
  });

  describe('Authentication', () => {
    it('should require authentication for all endpoints', async () => {
      const endpoints = [
        { method: 'get', path: `/api/admin/knowledge-bases?tenant_id=${testTenantId}` },
        { method: 'get', path: `/api/admin/knowledge-bases/${uuidv4()}` },
        { method: 'post', path: '/api/admin/knowledge-bases' },
        { method: 'put', path: `/api/admin/knowledge-bases/${uuidv4()}` },
        { method: 'delete', path: `/api/admin/knowledge-bases/${uuidv4()}` },
      ];

      for (const endpoint of endpoints) {
        const response = await (request(app) as any)[endpoint.method](endpoint.path);
        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('error', 'Unauthorized');
      }
    });
  });

  describe('GET /api/admin/knowledge-bases', () => {
    it('should return empty list when no knowledge bases exist', async () => {
      const response = await request(app)
        .get(`/api/admin/knowledge-bases?tenant_id=${testTenantId}`)
        .set('X-API-KEY', 'ikbeneenaap');

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
      expect(response.body.count).toBe(0);
    });

    it('should require tenant_id query parameter', async () => {
      const response = await request(app)
        .get('/api/admin/knowledge-bases')
        .set('X-API-KEY', 'ikbeneenaap');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request');
      expect(response.body.message).toBe('tenant_id is required');
    });

    it('should validate tenant_id format', async () => {
      const response = await request(app)
        .get('/api/admin/knowledge-bases?tenant_id=invalid-uuid')
        .set('X-API-KEY', 'ikbeneenaap');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid tenant_id format');
    });

    it('should return knowledge bases for tenant', async () => {
      // Create test knowledge base
      testKnowledgeBaseId = uuidv4();
      await db
        .insertInto('knowledge_bases')
        .values({
          id: testKnowledgeBaseId,
          tenant_id: testTenantId,
          name: 'Test Documentation',
          sitemap_url: 'https://docs.example.com/sitemap.xml',
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      const response = await request(app)
        .get(`/api/admin/knowledge-bases?tenant_id=${testTenantId}`)
        .set('X-API-KEY', 'ikbeneenaap');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        id: testKnowledgeBaseId,
        tenant_id: testTenantId,
        name: 'Test Documentation',
        sitemap_url: 'https://docs.example.com/sitemap.xml',
      });
      expect(response.body.count).toBe(1);
    });
  });

  describe('GET /api/admin/knowledge-bases/:id', () => {
    it('should return 404 for non-existent knowledge base', async () => {
      const fakeId = uuidv4();
      const response = await request(app)
        .get(`/api/admin/knowledge-bases/${fakeId}`)
        .set('X-API-KEY', 'ikbeneenaap');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Knowledge base not found');
    });

    it('should validate knowledge base ID format', async () => {
      const response = await request(app)
        .get('/api/admin/knowledge-bases/invalid-uuid')
        .set('X-API-KEY', 'ikbeneenaap');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid knowledge base ID format');
    });

    it('should return knowledge base details', async () => {
      // Create test knowledge base
      testKnowledgeBaseId = uuidv4();
      await db
        .insertInto('knowledge_bases')
        .values({
          id: testKnowledgeBaseId,
          tenant_id: testTenantId,
          name: 'Test Documentation',
          sitemap_url: 'https://docs.example.com/sitemap.xml',
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      const response = await request(app)
        .get(`/api/admin/knowledge-bases/${testKnowledgeBaseId}`)
        .set('X-API-KEY', 'ikbeneenaap');

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        id: testKnowledgeBaseId,
        tenant_id: testTenantId,
        name: 'Test Documentation',
        sitemap_url: 'https://docs.example.com/sitemap.xml',
      });
    });
  });

  describe('POST /api/admin/knowledge-bases', () => {
    it('should create new knowledge base', async () => {
      const createData = {
        tenant_id: testTenantId,
        name: 'New Documentation',
        sitemap_url: 'https://newdocs.example.com/sitemap.xml',
      };

      const response = await request(app)
        .post('/api/admin/knowledge-bases')
        .set('X-API-KEY', 'ikbeneenaap')
        .send(createData);

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Knowledge base created successfully');
      expect(response.body.data).toMatchObject({
        tenant_id: testTenantId,
        name: 'New Documentation',
        sitemap_url: 'https://newdocs.example.com/sitemap.xml',
      });
      expect(response.body.data.id).toBeDefined();

      // Verify it was saved to database
      const saved = await db
        .selectFrom('knowledge_bases')
        .selectAll()
        .where('id', '=', response.body.data.id)
        .executeTakeFirst();

      expect(saved).toBeDefined();
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/admin/knowledge-bases')
        .set('X-API-KEY', 'ikbeneenaap')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request');
    });

    it('should validate tenant_id format', async () => {
      const response = await request(app)
        .post('/api/admin/knowledge-bases')
        .set('X-API-KEY', 'ikbeneenaap')
        .send({
          tenant_id: 'invalid-uuid',
          name: 'Test',
          sitemap_url: 'https://test.com/sitemap.xml',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation error');
      expect(response.body.field).toBe('tenant_id');
    });

    it('should require HTTPS for sitemap URL', async () => {
      const response = await request(app)
        .post('/api/admin/knowledge-bases')
        .set('X-API-KEY', 'ikbeneenaap')
        .send({
          tenant_id: testTenantId,
          name: 'Test',
          sitemap_url: 'http://test.com/sitemap.xml',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation error');
      expect(response.body.message).toContain('HTTPS protocol');
    });

    it('should trim and validate name', async () => {
      const response = await request(app)
        .post('/api/admin/knowledge-bases')
        .set('X-API-KEY', 'ikbeneenaap')
        .send({
          tenant_id: testTenantId,
          name: '   ',
          sitemap_url: 'https://test.com/sitemap.xml',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation error');
      expect(response.body.field).toBe('name');
    });
  });

  describe('PUT /api/admin/knowledge-bases/:id', () => {
    beforeEach(async () => {
      // Create test knowledge base for update tests
      testKnowledgeBaseId = uuidv4();
      await db
        .insertInto('knowledge_bases')
        .values({
          id: testKnowledgeBaseId,
          tenant_id: testTenantId,
          name: 'Original Name',
          sitemap_url: 'https://original.com/sitemap.xml',
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();
    });

    it('should update knowledge base name', async () => {
      const response = await request(app)
        .put(`/api/admin/knowledge-bases/${testKnowledgeBaseId}`)
        .set('X-API-KEY', 'ikbeneenaap')
        .send({
          name: 'Updated Name',
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Knowledge base updated successfully');
      expect(response.body.data.name).toBe('Updated Name');
      expect(response.body.data.sitemap_url).toBe('https://original.com/sitemap.xml');
    });

    it('should update knowledge base sitemap URL', async () => {
      const response = await request(app)
        .put(`/api/admin/knowledge-bases/${testKnowledgeBaseId}`)
        .set('X-API-KEY', 'ikbeneenaap')
        .send({
          sitemap_url: 'https://updated.com/sitemap.xml',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.sitemap_url).toBe('https://updated.com/sitemap.xml');
      expect(response.body.data.name).toBe('Original Name');
    });

    it('should update multiple fields', async () => {
      const response = await request(app)
        .put(`/api/admin/knowledge-bases/${testKnowledgeBaseId}`)
        .set('X-API-KEY', 'ikbeneenaap')
        .send({
          name: 'Completely Updated',
          sitemap_url: 'https://completely-new.com/sitemap.xml',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe('Completely Updated');
      expect(response.body.data.sitemap_url).toBe('https://completely-new.com/sitemap.xml');
    });

    it('should return 404 for non-existent knowledge base', async () => {
      const fakeId = uuidv4();
      const response = await request(app)
        .put(`/api/admin/knowledge-bases/${fakeId}`)
        .set('X-API-KEY', 'ikbeneenaap')
        .send({
          name: 'Updated',
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Knowledge base not found');
    });

    it('should validate HTTPS for updated sitemap URL', async () => {
      const response = await request(app)
        .put(`/api/admin/knowledge-bases/${testKnowledgeBaseId}`)
        .set('X-API-KEY', 'ikbeneenaap')
        .send({
          sitemap_url: 'http://insecure.com/sitemap.xml',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation error');
      expect(response.body.message).toContain('HTTPS protocol');
    });

    it('should require at least one field to update', async () => {
      const response = await request(app)
        .put(`/api/admin/knowledge-bases/${testKnowledgeBaseId}`)
        .set('X-API-KEY', 'ikbeneenaap')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request');
      expect(response.body.message).toBe('At least one field must be provided to update');
    });
  });

  describe('DELETE /api/admin/knowledge-bases/:id', () => {
    beforeEach(async () => {
      // Create test knowledge base for delete tests
      testKnowledgeBaseId = uuidv4();
      await db
        .insertInto('knowledge_bases')
        .values({
          id: testKnowledgeBaseId,
          tenant_id: testTenantId,
          name: 'To Be Deleted',
          sitemap_url: 'https://delete-me.com/sitemap.xml',
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();
    });

    it('should delete knowledge base', async () => {
      const response = await request(app)
        .delete(`/api/admin/knowledge-bases/${testKnowledgeBaseId}`)
        .set('X-API-KEY', 'ikbeneenaap');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Knowledge base deleted successfully');
      expect(response.body.id).toBe(testKnowledgeBaseId);

      // Verify it was deleted
      const deleted = await db
        .selectFrom('knowledge_bases')
        .selectAll()
        .where('id', '=', testKnowledgeBaseId)
        .executeTakeFirst();

      expect(deleted).toBeUndefined();
    });

    it('should return 404 for non-existent knowledge base', async () => {
      const fakeId = uuidv4();
      const response = await request(app)
        .delete(`/api/admin/knowledge-bases/${fakeId}`)
        .set('X-API-KEY', 'ikbeneenaap');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Knowledge base not found');
    });

    it('should validate knowledge base ID format', async () => {
      const response = await request(app)
        .delete('/api/admin/knowledge-bases/invalid-uuid')
        .set('X-API-KEY', 'ikbeneenaap');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid knowledge base ID format');
    });
  });

  describe('POST /api/admin/knowledge-bases/:id/crawl', () => {
    beforeEach(async () => {
      // Create test knowledge base
      testKnowledgeBaseId = uuidv4();
      await db
        .insertInto('knowledge_bases')
        .values({
          id: testKnowledgeBaseId,
          tenant_id: testTenantId,
          name: 'Test KB for Crawl',
          sitemap_url: 'https://crawl-me.com/sitemap.xml',
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();
    });

    it('should queue crawl job', async () => {
      const response = await request(app)
        .post(`/api/admin/knowledge-bases/${testKnowledgeBaseId}/crawl`)
        .set('X-API-KEY', 'ikbeneenaap');

      expect(response.status).toBe(202);
      expect(response.body.message).toBe('Crawl job queued successfully');
      expect(response.body.knowledge_base_id).toBe(testKnowledgeBaseId);
      expect(response.body.status).toBe('queued');
    });

    it('should return 404 for non-existent knowledge base', async () => {
      const fakeId = uuidv4();
      const response = await request(app)
        .post(`/api/admin/knowledge-bases/${fakeId}/crawl`)
        .set('X-API-KEY', 'ikbeneenaap');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Knowledge base not found');
    });
  });
});