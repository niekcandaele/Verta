/**
 * Tests for different sync trigger methods - simplified with mocks
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from 'vitest';
import request from 'supertest';
import { Application } from 'express';
import { createApp } from '../../app.js';
import { config } from '../../config/env.js';
import {
  createTestDatabase,
  destroyTestDatabase,
  type TestDatabaseContext,
} from '../../test/testcontainers-setup.js';
import type { Tenant } from '../../repositories/tenant/types.js';
import { TenantRepositoryImpl } from '../../repositories/tenant/TenantRepositoryImpl.js';

// Hoist the mock function so it's accessible in tests
const { mockSyncQueueAdd } = vi.hoisted(() => ({
  mockSyncQueueAdd: vi.fn(),
}));

// Mock the entire syncQueue module before any imports
vi.mock('../../queues/syncQueue.js', () => ({
  SYNC_QUEUE_NAME: 'platform-sync',
  syncQueue: {
    add: mockSyncQueueAdd,
    removeRepeatable: vi.fn(),
  },
}));

// Mock SyncServiceImpl to avoid database connection in constructor
vi.mock('../../services/sync/SyncServiceImpl.js', () => ({
  SyncServiceImpl: vi.fn().mockImplementation(() => ({
    startSync: vi
      .fn()
      .mockImplementation(async (tenantId: string, options?: any) => {
        // Call the mocked syncQueue.add
        const job = await mockSyncQueueAdd(
          'sync-tenant',
          {
            tenantId,
            syncType: options?.syncType || 'incremental',
          },
          {
            delay: 0,
            removeOnComplete: {
              age: 24 * 3600,
              count: 100,
            },
            removeOnFail: {
              age: 7 * 24 * 3600,
            },
          }
        );
        return {
          success: true,
          data: { jobId: job.id },
        };
      }),
    getSyncHistory: vi.fn().mockResolvedValue({
      success: true,
      data: [],
    }),
  })),
}));

// Mock the HourlyTriggerWorker to avoid Redis
vi.mock('../../workers/hourlyTriggerWorker.js', () => ({
  HourlyTriggerWorker: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));

describe('Sync Trigger Methods (Simplified)', () => {
  let testContext: TestDatabaseContext;
  let app: Application;
  let activeTenant: Tenant;
  let cancelledTenant: Tenant;
  let slackTenant: Tenant;

  beforeAll(async () => {
    // Set mock implementation
    mockSyncQueueAdd.mockResolvedValue({ id: 'mock-job-id' });

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

    // Clear mock calls
    vi.clearAllMocks();

    // Create test tenants
    const tenantRepo = new TenantRepositoryImpl(testContext.db);

    // Active Discord tenant
    activeTenant = await tenantRepo.create({
      name: 'Active Discord',
      slug: 'active-discord',
      platform: 'discord',
      platformId: 'D123456',
      status: 'ACTIVE',
    });

    // Cancelled Discord tenant
    cancelledTenant = await tenantRepo.create({
      name: 'Cancelled Discord',
      slug: 'cancelled-discord',
      platform: 'discord',
      platformId: 'D789012',
      status: 'CANCELLED',
    });

    // Active Slack tenant (should not sync)
    slackTenant = await tenantRepo.create({
      name: 'Active Slack',
      slug: 'active-slack',
      platform: 'slack',
      platformId: 'S123456',
      status: 'ACTIVE',
    });
  });

  describe('Manual Sync via API', () => {
    describe('POST /api/tenants/:id/sync', () => {
      it('should trigger sync for active Discord tenant', async () => {
        const response = await request(app)
          .post(`/api/tenants/${activeTenant.id}/sync`)
          .set('X-API-KEY', config.ADMIN_API_KEY)
          .send({});

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
          jobId: 'mock-job-id',
          message: 'Sync job started successfully',
        });

        // Verify syncQueue.add was called with correct parameters
        expect(mockSyncQueueAdd).toHaveBeenCalledTimes(1);
        expect(mockSyncQueueAdd).toHaveBeenCalledWith(
          'sync-tenant',
          {
            tenantId: activeTenant.id,
            syncType: 'incremental',
          },
          expect.objectContaining({
            delay: 0,
            removeOnComplete: {
              age: 24 * 3600,
              count: 100,
            },
            removeOnFail: {
              age: 7 * 24 * 3600,
            },
          })
        );
      });

      it('should allow specifying sync type', async () => {
        const response = await request(app)
          .post(`/api/tenants/${activeTenant.id}/sync`)
          .set('X-API-KEY', config.ADMIN_API_KEY)
          .send({ syncType: 'full' });

        expect(response.status).toBe(201);

        // Verify full sync type was used
        expect(mockSyncQueueAdd).toHaveBeenCalledWith(
          'sync-tenant',
          {
            tenantId: activeTenant.id,
            syncType: 'full',
          },
          expect.any(Object)
        );
      });

      it('should reject sync for cancelled tenant', async () => {
        const response = await request(app)
          .post(`/api/tenants/${cancelledTenant.id}/sync`)
          .set('X-API-KEY', config.ADMIN_API_KEY)
          .send({});

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Bad Request');

        // Verify syncQueue.add was NOT called
        expect(mockSyncQueueAdd).not.toHaveBeenCalled();
      });

      it('should reject sync for non-Discord tenant', async () => {
        const response = await request(app)
          .post(`/api/tenants/${slackTenant.id}/sync`)
          .set('X-API-KEY', config.ADMIN_API_KEY)
          .send({});

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Bad Request');

        // Verify syncQueue.add was NOT called
        expect(mockSyncQueueAdd).not.toHaveBeenCalled();
      });

      it('should return 404 for non-existent tenant', async () => {
        const response = await request(app)
          .post('/api/tenants/550e8400-e29b-41d4-a716-446655440000/sync')
          .set('X-API-KEY', config.ADMIN_API_KEY)
          .send({});

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Not Found');

        // Verify syncQueue.add was NOT called
        expect(mockSyncQueueAdd).not.toHaveBeenCalled();
      });

      it('should validate UUID format', async () => {
        const response = await request(app)
          .post('/api/tenants/invalid-uuid/sync')
          .set('X-API-KEY', config.ADMIN_API_KEY)
          .send({});

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Validation Error');

        // Verify syncQueue.add was NOT called
        expect(mockSyncQueueAdd).not.toHaveBeenCalled();
      });

      it('should require authentication', async () => {
        const response = await request(app)
          .post(`/api/tenants/${activeTenant.id}/sync`)
          .send({});

        expect(response.status).toBe(401);

        // Verify syncQueue.add was NOT called
        expect(mockSyncQueueAdd).not.toHaveBeenCalled();
      });
    });

    describe('GET /api/tenants/:id/sync/status', () => {
      it('should get sync status for tenant', async () => {
        const response = await request(app)
          .get(`/api/tenants/${activeTenant.id}/sync/status`)
          .set('X-API-KEY', config.ADMIN_API_KEY);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          status: 'never_synced',
          message: 'This tenant has never been synced',
        });
      });

      it('should return sync status for non-existent tenant', async () => {
        const response = await request(app)
          .get('/api/tenants/550e8400-e29b-41d4-a716-446655440000/sync/status')
          .set('X-API-KEY', config.ADMIN_API_KEY);

        // The sync status endpoint doesn't verify tenant exists - it just returns sync history
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          status: 'never_synced',
          message: 'This tenant has never been synced',
        });
      });
    });
  });

  describe('Automatic Sync on Tenant Creation', () => {
    it('should trigger sync when creating Discord tenant', async () => {
      const response = await request(app)
        .post('/api/tenants')
        .set('X-API-KEY', config.ADMIN_API_KEY)
        .send({
          name: 'New Discord Tenant',
          slug: 'new-discord',
          platform: 'discord',
          platformId: 'D999999',
        });

      expect(response.status).toBe(201);
      const createdTenantId = response.body.id;

      // Wait a bit for async sync trigger
      await new Promise<void>((resolve) => setTimeout(resolve, 100));

      // Verify syncQueue.add was called for initial sync
      expect(mockSyncQueueAdd).toHaveBeenCalledWith(
        'sync-tenant',
        {
          tenantId: createdTenantId,
          syncType: 'full', // Initial sync should be full
        },
        expect.objectContaining({
          delay: 0,
        })
      );
    });

    it('should NOT trigger sync when creating Slack tenant', async () => {
      const response = await request(app)
        .post('/api/tenants')
        .set('X-API-KEY', config.ADMIN_API_KEY)
        .send({
          name: 'New Slack Tenant',
          slug: 'new-slack',
          platform: 'slack',
          platformId: 'S999999',
        });

      expect(response.status).toBe(201);

      // Wait a bit to ensure no async calls
      await new Promise<void>((resolve) => setTimeout(resolve, 100));

      // Verify syncQueue.add was NOT called
      expect(mockSyncQueueAdd).not.toHaveBeenCalled();
    });

    it('should create tenant even if sync trigger fails', async () => {
      // Make syncQueue.add throw an error
      mockSyncQueueAdd.mockRejectedValueOnce(new Error('Queue error'));

      const response = await request(app)
        .post('/api/tenants')
        .set('X-API-KEY', config.ADMIN_API_KEY)
        .send({
          name: 'Discord with Failed Sync',
          slug: 'discord-failed-sync',
          platform: 'discord',
          platformId: 'D888888',
        });

      // Tenant should still be created successfully
      expect(response.status).toBe(201);
      expect(response.body.name).toBe('Discord with Failed Sync');

      // Verify sync was attempted
      expect(mockSyncQueueAdd).toHaveBeenCalled();
    });
  });

  describe('Sync Job Options', () => {
    it('should set correct job options for manual sync', async () => {
      await request(app)
        .post(`/api/tenants/${activeTenant.id}/sync`)
        .set('X-API-KEY', config.ADMIN_API_KEY)
        .send({});

      expect(mockSyncQueueAdd).toHaveBeenCalledWith(
        'sync-tenant',
        expect.any(Object),
        expect.objectContaining({
          removeOnComplete: {
            age: 24 * 3600,
            count: 100,
          },
          removeOnFail: {
            age: 7 * 24 * 3600,
          },
        })
      );
    });
  });
});
