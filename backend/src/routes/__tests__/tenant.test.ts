/**
 * Tests for tenant routes
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Application } from 'express';
import { createApp } from '../../app.js';
import { config } from '../../config/env.js';

describe('Tenant Routes', () => {
  let app: Application;

  beforeEach(() => {
    app = createApp();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should require authentication for all tenant endpoints', async () => {
      const endpoints = [
        { method: 'get', path: '/api/tenants' },
        { method: 'get', path: '/api/tenants/123' },
        { method: 'post', path: '/api/tenants' },
        { method: 'patch', path: '/api/tenants/123' },
        { method: 'delete', path: '/api/tenants/123' },
      ];

      for (const endpoint of endpoints) {
        const response = await (request(app) as any)[endpoint.method](
          endpoint.path
        );
        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('error', 'Unauthorized');
        expect(response.body).toHaveProperty(
          'message',
          'X-API-KEY header is required'
        );
      }
    });

    it('should reject invalid API key', async () => {
      const response = await request(app)
        .get('/api/tenants')
        .set('X-API-KEY', 'invalid-key');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Unauthorized');
      expect(response.body).toHaveProperty('message', 'Invalid API key');
    });
  });

  describe('GET /api/tenants', () => {
    it('should validate query parameters', async () => {
      const response = await request(app)
        .get('/api/tenants?page=invalid&limit=200')
        .set('X-API-KEY', config.ADMIN_API_KEY);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
    });
  });

  describe('GET /api/tenants/:id', () => {
    it('should validate UUID format', async () => {
      const response = await request(app)
        .get('/api/tenants/invalid-uuid')
        .set('X-API-KEY', config.ADMIN_API_KEY);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
    });
  });

  describe('POST /api/tenants', () => {
    it('should validate request body', async () => {
      const response = await request(app)
        .post('/api/tenants')
        .set('X-API-KEY', config.ADMIN_API_KEY)
        .send({
          name: 'T', // Too short
          slug: '123', // Invalid format
          platform: 'invalid', // Invalid platform
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
    });
  });

  describe('PATCH /api/tenants/:id', () => {
    it('should validate UUID format', async () => {
      const response = await request(app)
        .patch('/api/tenants/invalid-uuid')
        .set('X-API-KEY', config.ADMIN_API_KEY)
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
    });

    it('should reject empty update body', async () => {
      const response = await request(app)
        .patch('/api/tenants/550e8400-e29b-41d4-a716-446655440000')
        .set('X-API-KEY', config.ADMIN_API_KEY)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Bad Request');
      expect(response.body).toHaveProperty(
        'message',
        'No valid fields provided for update'
      );
    });
  });

  describe('DELETE /api/tenants/:id', () => {
    it('should validate UUID format', async () => {
      const response = await request(app)
        .delete('/api/tenants/invalid-uuid')
        .set('X-API-KEY', config.ADMIN_API_KEY);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
    });
  });
});
