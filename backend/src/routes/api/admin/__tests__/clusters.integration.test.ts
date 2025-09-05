/**
 * Integration tests for admin cluster routes
 * Tests full workflow: create cluster → add golden answer → view in FAQ
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
let testClusterId: string;

describe('Admin Clusters API Integration', () => {
  beforeAll(async () => {
    // Note: In a real setup, you'd use testcontainers here
    // For now, we'll use the existing database connection
    const { db: database } = await import('../../../../database/index.js');
    db = database;
    app = createApp(db);
    
    // Create test tenant
    testTenantId = uuidv4();
    await db
      .insertInto('tenants')
      .values({
        id: testTenantId,
        name: 'Test Tenant',
        slug: 'test-tenant',
        status: 'ACTIVE',
        platform: 'discord',
        platform_id: 'test-platform-id',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();
  });

  afterAll(async () => {
    // Clean up test data
    if (testTenantId) {
      await db
        .deleteFrom('golden_answers')
        .where('tenant_id', '=', testTenantId)
        .execute();
      
      await db
        .deleteFrom('question_clusters')
        .where('tenant_id', '=', testTenantId)
        .execute();
      
      await db
        .deleteFrom('tenants')
        .where('id', '=', testTenantId)
        .execute();
    }
  });

  beforeEach(async () => {
    // Create a test cluster for each test
    testClusterId = uuidv4();
    
    // Create embedding array with 1024 dimensions (all zeros for testing)
    const embedding = JSON.stringify(new Array(1024).fill(0));
    
    await db
      .insertInto('question_clusters')
      .values({
        id: testClusterId,
        tenant_id: testTenantId,
        representative_text: 'Test question about the system?',
        thread_title: 'Test Thread',
        embedding: embedding as any,
        instance_count: 5,
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();
  });

  describe('GET /api/admin/clusters', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/admin/clusters');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Unauthorized');
    });

    it('should return clusters with valid auth', async () => {
      const response = await request(app)
        .get('/api/admin/clusters')
        .set('X-API-KEY', 'ikbeneenaap');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/admin/clusters?page=1&limit=5')
        .set('X-API-KEY', 'ikbeneenaap');

      expect(response.status).toBe(200);
      expect(response.body.pagination).toMatchObject({
        page: 1,
        limit: 5,
      });
    });

    it('should support sorting', async () => {
      const response = await request(app)
        .get('/api/admin/clusters?sort_by=instance_count&sort_order=desc')
        .set('X-API-KEY', 'ikbeneenaap');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      
      // Check if sorted correctly (if there are multiple items)
      if (response.body.data.length > 1) {
        for (let i = 1; i < response.body.data.length; i++) {
          expect(response.body.data[i - 1].instance_count)
            .toBeGreaterThanOrEqual(response.body.data[i].instance_count);
        }
      }
    });
  });

  describe('GET /api/admin/clusters/:id', () => {
    it('should return cluster details', async () => {
      const response = await request(app)
        .get(`/api/admin/clusters/${testClusterId}`)
        .set('X-API-KEY', 'ikbeneenaap');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('cluster');
      expect(response.body).toHaveProperty('golden_answer');
      expect(response.body).toHaveProperty('instances');
      expect(response.body.cluster.id).toBe(testClusterId);
    });

    it('should return 404 for non-existent cluster', async () => {
      const fakeId = uuidv4();
      const response = await request(app)
        .get(`/api/admin/clusters/${fakeId}`)
        .set('X-API-KEY', 'ikbeneenaap');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Cluster not found');
    });

    it('should return 400 for invalid UUID', async () => {
      const response = await request(app)
        .get('/api/admin/clusters/invalid-uuid')
        .set('X-API-KEY', 'ikbeneenaap');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid cluster ID format');
    });
  });

  describe('POST /api/admin/clusters/:id/golden-answer', () => {
    it('should create a golden answer', async () => {
      const answerData = {
        answer: '**This is a test answer** with *markdown*',
        answer_format: 'markdown',
        created_by: 'test-admin',
      };

      const response = await request(app)
        .post(`/api/admin/clusters/${testClusterId}/golden-answer`)
        .set('X-API-KEY', 'ikbeneenaap')
        .send(answerData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message', 'Golden answer saved successfully');
      expect(response.body).toHaveProperty('golden_answer');
      expect(response.body.golden_answer.answer).toBe(answerData.answer);
      expect(response.body.golden_answer.answer_format).toBe(answerData.answer_format);
    });

    it('should update existing golden answer', async () => {
      // First create an answer
      await request(app)
        .post(`/api/admin/clusters/${testClusterId}/golden-answer`)
        .set('X-API-KEY', 'ikbeneenaap')
        .send({
          answer: 'Initial answer',
          answer_format: 'plaintext',
        });

      // Then update it
      const updatedData = {
        answer: 'Updated answer with **markdown**',
        answer_format: 'markdown',
      };

      const response = await request(app)
        .post(`/api/admin/clusters/${testClusterId}/golden-answer`)
        .set('X-API-KEY', 'ikbeneenaap')
        .send(updatedData);

      expect(response.status).toBe(201);
      expect(response.body.golden_answer.answer).toBe(updatedData.answer);
      expect(response.body.golden_answer.answer_format).toBe(updatedData.answer_format);
    });

    it('should sanitize dangerous markdown', async () => {
      const dangerousAnswer = {
        answer: '<script>alert("XSS")</script> **Safe content**',
        answer_format: 'markdown',
      };

      const response = await request(app)
        .post(`/api/admin/clusters/${testClusterId}/golden-answer`)
        .set('X-API-KEY', 'ikbeneenaap')
        .send(dangerousAnswer);

      expect(response.status).toBe(201);
      expect(response.body.golden_answer.answer).not.toContain('<script>');
      expect(response.body.golden_answer.answer).toContain('**Safe content**');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post(`/api/admin/clusters/${testClusterId}/golden-answer`)
        .set('X-API-KEY', 'ikbeneenaap')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid request');
    });

    it('should validate answer_format', async () => {
      const response = await request(app)
        .post(`/api/admin/clusters/${testClusterId}/golden-answer`)
        .set('X-API-KEY', 'ikbeneenaap')
        .send({
          answer: 'Test answer',
          answer_format: 'invalid-format',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid answer_format');
    });
  });

  describe('DELETE /api/admin/clusters/:id/golden-answer', () => {
    beforeEach(async () => {
      // Create a golden answer to delete
      await db
        .insertInto('golden_answers')
        .values({
          id: uuidv4(),
          cluster_id: testClusterId,
          tenant_id: testTenantId,
          answer: 'Answer to delete',
          answer_format: 'plaintext',
          created_by: 'test-admin',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();
    });

    it('should delete golden answer', async () => {
      const response = await request(app)
        .delete(`/api/admin/clusters/${testClusterId}/golden-answer`)
        .set('X-API-KEY', 'ikbeneenaap');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Golden answer deleted successfully');

      // Verify it's actually deleted
      const checkResponse = await request(app)
        .get(`/api/admin/clusters/${testClusterId}`)
        .set('X-API-KEY', 'ikbeneenaap');

      expect(checkResponse.body.golden_answer).toBeNull();
    });

    it('should return 404 if no golden answer exists', async () => {
      // Delete first
      await request(app)
        .delete(`/api/admin/clusters/${testClusterId}/golden-answer`)
        .set('X-API-KEY', 'ikbeneenaap');

      // Try to delete again
      const response = await request(app)
        .delete(`/api/admin/clusters/${testClusterId}/golden-answer`)
        .set('X-API-KEY', 'ikbeneenaap');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Golden answer not found');
    });
  });

  describe('Full Workflow: Admin to FAQ', () => {
    it('should complete full workflow from admin to public FAQ', async () => {
      // Step 1: Create golden answer via admin API
      const answerData = {
        answer: '## Complete Answer\n\nThis is a comprehensive answer with:\n- Bullet points\n- **Bold text**\n- *Italic text*',
        answer_format: 'markdown',
        created_by: 'admin',
      };

      const createResponse = await request(app)
        .post(`/api/admin/clusters/${testClusterId}/golden-answer`)
        .set('X-API-KEY', 'ikbeneenaap')
        .send(answerData);

      expect(createResponse.status).toBe(201);

      // Step 2: Verify it appears in admin cluster details
      const detailsResponse = await request(app)
        .get(`/api/admin/clusters/${testClusterId}`)
        .set('X-API-KEY', 'ikbeneenaap');

      expect(detailsResponse.status).toBe(200);
      expect(detailsResponse.body.golden_answer).not.toBeNull();
      expect(detailsResponse.body.golden_answer.answer).toBe(answerData.answer);

      // Step 3: Verify it appears in public FAQ endpoint
      const faqResponse = await request(app)
        .get(`/api/v1/faq?tenant_id=${testTenantId}`);

      expect(faqResponse.status).toBe(200);
      expect(faqResponse.body.data).toHaveLength(1);
      expect(faqResponse.body.data[0]).toMatchObject({
        id: testClusterId,
        question: 'Test question about the system?',
        answer: answerData.answer,
        answer_format: 'markdown',
        popularity: 5,
      });

      // Step 4: Verify caching works
      const cachedResponse = await request(app)
        .get(`/api/v1/faq/cached?tenant_id=${testTenantId}`);

      expect(cachedResponse.status).toBe(200);
      expect(cachedResponse.body).toHaveProperty('cached_at');
      expect(cachedResponse.body.data).toHaveLength(1);
    });
  });
});