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

      await db.deleteFrom('tenants').where('id', '=', testTenantId).execute();
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
      const response = await request(app).get('/api/admin/clusters');

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
          expect(
            response.body.data[i - 1].instance_count
          ).toBeGreaterThanOrEqual(response.body.data[i].instance_count);
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
      expect(response.body).toHaveProperty(
        'error',
        'Invalid cluster ID format'
      );
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
      expect(response.body).toHaveProperty(
        'message',
        'Golden answer saved successfully'
      );
      expect(response.body).toHaveProperty('golden_answer');
      expect(response.body.golden_answer.answer).toBe(answerData.answer);
      expect(response.body.golden_answer.answer_format).toBe(
        answerData.answer_format
      );
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
      expect(response.body.golden_answer.answer_format).toBe(
        updatedData.answer_format
      );
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
      expect(response.body).toHaveProperty(
        'message',
        'Golden answer deleted successfully'
      );

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

  describe('POST /api/admin/clusters', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/admin/clusters')
        .send({
          tenant_id: testTenantId,
          representative_text: 'Test question?'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Unauthorized');
    });

    it('should create cluster with minimal fields', async () => {
      const clusterData = {
        tenant_id: testTenantId,
        representative_text: 'How do I configure the system?'
      };

      const response = await request(app)
        .post('/api/admin/clusters')
        .set('X-API-KEY', 'ikbeneenaap')
        .send(clusterData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message', 'Cluster created successfully');
      expect(response.body).toHaveProperty('cluster');
      expect(response.body.cluster).toMatchObject({
        tenant_id: testTenantId,
        representative_text: 'How do I configure the system?',
        instance_count: 0,
      });
      expect(response.body.cluster.metadata).toMatchObject({
        source: 'manual',
        example_questions: []
      });
    });

    it('should create cluster with example questions', async () => {
      const clusterData = {
        tenant_id: testTenantId,
        representative_text: 'Database connection issues',
        thread_title: 'DB Problems',
        example_questions: [
          'How to fix connection timeout?',
          'Database not responding',
          'Connection pool exhausted'
        ]
      };

      const response = await request(app)
        .post('/api/admin/clusters')
        .set('X-API-KEY', 'ikbeneenaap')
        .send(clusterData);

      expect(response.status).toBe(201);
      expect(response.body.cluster).toMatchObject({
        tenant_id: testTenantId,
        representative_text: 'Database connection issues',
        thread_title: 'DB Problems',
        instance_count: 0,
      });
      expect(response.body.cluster.metadata).toMatchObject({
        source: 'manual',
        example_questions: clusterData.example_questions
      });
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/admin/clusters')
        .set('X-API-KEY', 'ikbeneenaap')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid request');
      expect(response.body.message).toContain('tenant_id is required');
    });

    it('should validate tenant_id format', async () => {
      const response = await request(app)
        .post('/api/admin/clusters')
        .set('X-API-KEY', 'ikbeneenaap')
        .send({
          tenant_id: 'invalid-uuid',
          representative_text: 'Test question?'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid tenant_id format');
    });

    it('should validate representative_text', async () => {
      const response = await request(app)
        .post('/api/admin/clusters')
        .set('X-API-KEY', 'ikbeneenaap')
        .send({
          tenant_id: testTenantId,
          representative_text: ''
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid request');
      expect(response.body.message).toContain('representative_text');
    });

    it('should validate example_questions format', async () => {
      const response = await request(app)
        .post('/api/admin/clusters')
        .set('X-API-KEY', 'ikbeneenaap')
        .send({
          tenant_id: testTenantId,
          representative_text: 'Test question?',
          example_questions: 'not an array'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid request');
      expect(response.body.message).toContain('example_questions must be an array');
    });
  });

  describe('DELETE /api/admin/clusters/:id', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .delete(`/api/admin/clusters/${testClusterId}`);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Unauthorized');
    });

    it('should delete existing cluster', async () => {
      const response = await request(app)
        .delete(`/api/admin/clusters/${testClusterId}`)
        .set('X-API-KEY', 'ikbeneenaap');

      expect(response.status).toBe(204);

      // Verify cluster is deleted
      const checkResponse = await request(app)
        .get(`/api/admin/clusters/${testClusterId}`)
        .set('X-API-KEY', 'ikbeneenaap');

      expect(checkResponse.status).toBe(404);
    });

    it('should return 404 for non-existent cluster', async () => {
      const fakeId = uuidv4();
      const response = await request(app)
        .delete(`/api/admin/clusters/${fakeId}`)
        .set('X-API-KEY', 'ikbeneenaap');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Cluster not found');
    });

    it('should return 400 for invalid UUID', async () => {
      const response = await request(app)
        .delete('/api/admin/clusters/invalid-uuid')
        .set('X-API-KEY', 'ikbeneenaap');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid cluster ID format');
    });

    it('should cascade delete associated data', async () => {
      // Create a cluster with golden answer and instances
      const clusterId = uuidv4();
      const embedding = JSON.stringify(new Array(1024).fill(0));

      await db
        .insertInto('question_clusters')
        .values({
          id: clusterId,
          tenant_id: testTenantId,
          representative_text: 'Cluster to delete',
          thread_title: 'Delete Test',
          embedding: embedding as any,
          instance_count: 1,
          first_seen_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          metadata: { source: 'manual' },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      // Add a golden answer
      await db
        .insertInto('golden_answers')
        .values({
          id: uuidv4(),
          cluster_id: clusterId,
          tenant_id: testTenantId,
          answer: 'Answer for cluster to delete',
          answer_format: 'plaintext',
          created_by: 'test-admin',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      // Add a question instance
      await db
        .insertInto('question_instances')
        .values({
          id: uuidv4(),
          cluster_id: clusterId,
          tenant_id: testTenantId,
          thread_id: 'test-thread-123',
          thread_title: 'Test Thread',
          original_text: 'Original question text',
          rephrased_text: 'Rephrased question text',
          confidence_score: 0.95,
          created_at: new Date().toISOString(),
        })
        .execute();

      // Delete the cluster
      const response = await request(app)
        .delete(`/api/admin/clusters/${clusterId}`)
        .set('X-API-KEY', 'ikbeneenaap');

      expect(response.status).toBe(204);

      // Verify cascade deletion worked
      const goldenAnswers = await db
        .selectFrom('golden_answers')
        .where('cluster_id', '=', clusterId)
        .execute();
      expect(goldenAnswers).toHaveLength(0);

      const instances = await db
        .selectFrom('question_instances')
        .where('cluster_id', '=', clusterId)
        .execute();
      expect(instances).toHaveLength(0);
    });
  });

  describe('Full Workflow: Admin to FAQ', () => {
    it('should complete full workflow from admin to public FAQ', async () => {
      // Step 1: Create golden answer via admin API
      const answerData = {
        answer:
          '## Complete Answer\n\nThis is a comprehensive answer with:\n- Bullet points\n- **Bold text**\n- *Italic text*',
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
      const faqResponse = await request(app).get(
        `/api/v1/faq?tenant_id=${testTenantId}`
      );

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
      const cachedResponse = await request(app).get(
        `/api/v1/faq/cached?tenant_id=${testTenantId}`
      );

      expect(cachedResponse.status).toBe(200);
      expect(cachedResponse.body).toHaveProperty('cached_at');
      expect(cachedResponse.body.data).toHaveLength(1);
    });
  });

  describe('Bulk Operations', () => {
    describe('POST /api/admin/clusters/bulk - Bulk Create', () => {
      it('should create multiple clusters in bulk', async () => {
        const bulkCreateData = {
          action: 'create',
          clusters: [
            {
              tenant_id: testTenantId,
              representative_text: 'Bulk cluster 1',
              thread_title: 'Thread 1',
              example_questions: ['Example question 1']
            },
            {
              tenant_id: testTenantId,
              representative_text: 'Bulk cluster 2',
              thread_title: 'Thread 2',
              example_questions: ['Example question 2', 'Another example']
            },
            {
              tenant_id: testTenantId,
              representative_text: 'Bulk cluster 3'
              // No thread_title or example_questions - testing optional fields
            }
          ]
        };

        const response = await request(app)
          .post('/api/admin/clusters/bulk')
          .set('X-API-KEY', 'ikbeneenaap')
          .send(bulkCreateData);

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('Successfully created 3 clusters');
        expect(response.body.clusters).toHaveLength(3);

        // Verify each cluster was created correctly
        response.body.clusters.forEach((cluster: any, index: number) => {
          expect(cluster).toHaveProperty('id');
          expect(cluster.tenant_id).toBe(testTenantId);
          expect(cluster.representative_text).toBe(bulkCreateData.clusters[index].representative_text);
          expect(cluster.instance_count).toBe(0);
        });
      });

      it('should validate all clusters before creating any (fail-fast)', async () => {
        const invalidBulkData = {
          action: 'create',
          clusters: [
            {
              tenant_id: testTenantId,
              representative_text: 'Valid cluster'
            },
            {
              tenant_id: 'invalid-uuid', // Invalid UUID
              representative_text: 'Invalid cluster'
            }
          ]
        };

        const response = await request(app)
          .post('/api/admin/clusters/bulk')
          .set('X-API-KEY', 'ikbeneenaap')
          .send(invalidBulkData);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid tenant ID');
        expect(response.body.message).toContain('Cluster at index 1');

        // Verify no clusters were created
        const clusters = await db
          .selectFrom('question_clusters')
          .where('representative_text', '=', 'Valid cluster')
          .execute();
        expect(clusters).toHaveLength(0);
      });

      it('should enforce maximum 10 clusters limit', async () => {
        const tooManyClusters = {
          action: 'create',
          clusters: Array(11).fill({
            tenant_id: testTenantId,
            representative_text: 'Test cluster'
          })
        };

        const response = await request(app)
          .post('/api/admin/clusters/bulk')
          .set('X-API-KEY', 'ikbeneenaap')
          .send(tooManyClusters);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Too many clusters');
        expect(response.body.message).toContain('Maximum 10 clusters');
      });

      it('should handle empty clusters array', async () => {
        const response = await request(app)
          .post('/api/admin/clusters/bulk')
          .set('X-API-KEY', 'ikbeneenaap')
          .send({
            action: 'create',
            clusters: []
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid input');
        expect(response.body.message).toContain('non-empty array');
      });

      it('should validate required fields', async () => {
        const missingFields = {
          action: 'create',
          clusters: [
            {
              tenant_id: testTenantId
              // Missing representative_text
            }
          ]
        };

        const response = await request(app)
          .post('/api/admin/clusters/bulk')
          .set('X-API-KEY', 'ikbeneenaap')
          .send(missingFields);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid cluster data');
        expect(response.body.message).toContain('missing required fields');
      });

      it('should only support create action', async () => {
        const response = await request(app)
          .post('/api/admin/clusters/bulk')
          .set('X-API-KEY', 'ikbeneenaap')
          .send({
            action: 'update',
            clusters: []
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid action');
        expect(response.body.message).toContain('Only "create" action is supported');
      });
    });

    describe('DELETE /api/admin/clusters/bulk - Bulk Delete', () => {
      let clusterIdsToDelete: string[] = [];

      beforeEach(async () => {
        // Create test clusters for deletion
        clusterIdsToDelete = [];
        for (let i = 0; i < 3; i++) {
          const clusterId = uuidv4();
          await db
            .insertInto('question_clusters')
            .values({
              id: clusterId,
              tenant_id: testTenantId,
              representative_text: `Delete test cluster ${i}`,
              instance_count: 0,
              first_seen_at: new Date().toISOString(),
              last_seen_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .execute();
          clusterIdsToDelete.push(clusterId);
        }
      });

      it('should delete multiple clusters in bulk', async () => {
        const response = await request(app)
          .delete('/api/admin/clusters/bulk')
          .set('X-API-KEY', 'ikbeneenaap')
          .send({
            cluster_ids: clusterIdsToDelete
          });

        expect(response.status).toBe(204);
        expect(response.body).toEqual({});

        // Verify all clusters were deleted
        const remainingClusters = await db
          .selectFrom('question_clusters')
          .where('id', 'in', clusterIdsToDelete)
          .execute();
        expect(remainingClusters).toHaveLength(0);
      });

      it('should validate all cluster IDs exist before deleting any', async () => {
        const nonExistentId = uuidv4();
        const mixedIds = [...clusterIdsToDelete.slice(0, 2), nonExistentId];

        const response = await request(app)
          .delete('/api/admin/clusters/bulk')
          .set('X-API-KEY', 'ikbeneenaap')
          .send({
            cluster_ids: mixedIds
          });

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Clusters not found');
        expect(response.body.message).toContain(nonExistentId);

        // Verify no clusters were deleted
        const remainingClusters = await db
          .selectFrom('question_clusters')
          .where('id', 'in', clusterIdsToDelete)
          .execute();
        expect(remainingClusters).toHaveLength(3);
      });

      it('should cascade delete related data', async () => {
        // Add a golden answer to one cluster
        const clusterWithAnswer = clusterIdsToDelete[0];
        await db
          .insertInto('golden_answers')
          .values({
            id: uuidv4(),
            tenant_id: testTenantId,
            cluster_id: clusterWithAnswer,
            answer: 'Test answer',
            answer_format: 'plaintext',
            created_by: 'test',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .execute();

        // Add question instances
        await db
          .insertInto('question_instances')
          .values({
            id: uuidv4(),
            tenant_id: testTenantId,
            cluster_id: clusterWithAnswer,
            thread_id: 'test-thread',
            original_text: 'Test question',
            confidence_score: 0.9,
            created_at: new Date().toISOString(),
          })
          .execute();

        const response = await request(app)
          .delete('/api/admin/clusters/bulk')
          .set('X-API-KEY', 'ikbeneenaap')
          .send({
            cluster_ids: [clusterWithAnswer]
          });

        expect(response.status).toBe(204);

        // Verify cascade deletion
        const goldenAnswers = await db
          .selectFrom('golden_answers')
          .where('cluster_id', '=', clusterWithAnswer)
          .execute();
        expect(goldenAnswers).toHaveLength(0);

        const instances = await db
          .selectFrom('question_instances')
          .where('cluster_id', '=', clusterWithAnswer)
          .execute();
        expect(instances).toHaveLength(0);
      });

      it('should enforce maximum 10 clusters limit', async () => {
        const tooManyIds = Array(11).fill(null).map(() => uuidv4());

        const response = await request(app)
          .delete('/api/admin/clusters/bulk')
          .set('X-API-KEY', 'ikbeneenaap')
          .send({
            cluster_ids: tooManyIds
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Too many clusters');
        expect(response.body.message).toContain('Maximum 10 clusters');
      });

      it('should handle empty cluster_ids array', async () => {
        const response = await request(app)
          .delete('/api/admin/clusters/bulk')
          .set('X-API-KEY', 'ikbeneenaap')
          .send({
            cluster_ids: []
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid input');
        expect(response.body.message).toContain('non-empty array');
      });

      it('should validate UUID format', async () => {
        const response = await request(app)
          .delete('/api/admin/clusters/bulk')
          .set('X-API-KEY', 'ikbeneenaap')
          .send({
            cluster_ids: ['not-a-uuid', uuidv4()]
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid cluster ID');
        expect(response.body.message).toContain('at index 0');
      });
    });
  });
});
