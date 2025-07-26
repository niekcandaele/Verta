import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ChannelRepositoryImpl } from '../ChannelRepository.js';
import {
  createTestDatabase,
  destroyTestDatabase,
  type TestDatabaseContext,
} from '../../../test/testcontainers-setup.js';
import type { CreateChannelData } from '../../../types/sync.js';

describe('ChannelRepository', () => {
  let testContext: TestDatabaseContext;
  let repository: ChannelRepositoryImpl;
  let testTenantId: string;

  beforeAll(async () => {
    // Create test database with migrations
    testContext = await createTestDatabase();

    // Create test tenant
    const tenant = await testContext.db
      .insertInto('tenants')
      .values({
        name: 'Test Tenant',
        slug: 'test-tenant',
        status: 'ACTIVE',
        platform: 'discord',
        platform_id: '123456789',
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    testTenantId = tenant.id;
    repository = new ChannelRepositoryImpl(testContext.db);
  });

  afterAll(async () => {
    await destroyTestDatabase(testContext);
  });

  beforeEach(async () => {
    // Clean up channels between tests (keep tenant)
    await testContext.db.deleteFrom('channels').execute();
  });

  describe('create', () => {
    it('should create a new channel', async () => {
      const channelData: CreateChannelData = {
        tenantId: testTenantId,
        platformChannelId: 'discord-123',
        name: 'general',
        type: 'text',
      };

      const channel = await repository.create(channelData);

      expect(channel).toBeDefined();
      expect(channel.id).toBeDefined();
      expect(channel.tenantId).toBe(testTenantId);
      expect(channel.platformChannelId).toBe('discord-123');
      expect(channel.name).toBe('general');
      expect(channel.type).toBe('text');
      expect(channel.parentChannelId).toBeNull();
      expect(channel.metadata).toEqual({});
    });

    it('should create a channel with metadata', async () => {
      const metadata = { topic: 'General discussion', nsfw: false };
      const channelData: CreateChannelData = {
        tenantId: testTenantId,
        platformChannelId: 'discord-456',
        name: 'announcements',
        type: 'text',
        metadata,
      };

      const channel = await repository.create(channelData);

      expect(channel.metadata).toEqual(metadata);
    });

    it('should create a thread channel with parent', async () => {
      // Create parent channel
      const parentData: CreateChannelData = {
        tenantId: testTenantId,
        platformChannelId: 'discord-parent',
        name: 'parent-channel',
        type: 'text',
      };
      const parent = await repository.create(parentData);

      // Create thread
      const threadData: CreateChannelData = {
        tenantId: testTenantId,
        platformChannelId: 'discord-thread',
        name: 'discussion-thread',
        type: 'thread',
        parentChannelId: parent.id,
      };

      const thread = await repository.create(threadData);

      expect(thread.type).toBe('thread');
      expect(thread.parentChannelId).toBe(parent.id);
    });
  });

  describe('findByPlatformId', () => {
    it('should find a channel by platform ID and tenant ID', async () => {
      const channelData: CreateChannelData = {
        tenantId: testTenantId,
        platformChannelId: 'discord-789',
        name: 'dev-chat',
        type: 'text',
      };
      const created = await repository.create(channelData);

      const found = await repository.findByPlatformId(
        testTenantId,
        'discord-789'
      );

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.platformChannelId).toBe('discord-789');
    });

    it('should return null for non-existent channel', async () => {
      const found = await repository.findByPlatformId(
        testTenantId,
        'non-existent'
      );

      expect(found).toBeNull();
    });
  });

  describe('findByTenant', () => {
    it('should find all channels for a tenant', async () => {
      const channels = [
        {
          tenantId: testTenantId,
          platformChannelId: 'ch-1',
          name: 'channel-1',
          type: 'text' as const,
        },
        {
          tenantId: testTenantId,
          platformChannelId: 'ch-2',
          name: 'channel-2',
          type: 'forum' as const,
        },
        {
          tenantId: testTenantId,
          platformChannelId: 'ch-3',
          name: 'channel-3',
          type: 'thread' as const,
        },
      ];

      for (const data of channels) {
        await repository.create(data);
      }

      const found = await repository.findByTenant(testTenantId);

      expect(found).toHaveLength(3);
      expect(found.map((c) => c.name)).toEqual([
        'channel-1',
        'channel-2',
        'channel-3',
      ]);
    });

    it('should return empty array for tenant with no channels', async () => {
      // Create a different tenant
      const otherTenant = await testContext.db
        .insertInto('tenants')
        .values({
          name: 'Other Tenant',
          slug: 'other-tenant',
          status: 'ACTIVE',
          platform: 'discord',
          platform_id: '987654321',
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      const found = await repository.findByTenant(otherTenant.id);
      expect(found).toEqual([]);
    });
  });

  describe('findByParentId', () => {
    it('should find child channels', async () => {
      const parent = await repository.create({
        tenantId: testTenantId,
        platformChannelId: 'parent',
        name: 'parent-forum',
        type: 'forum',
      });

      const children = [
        {
          tenantId: testTenantId,
          platformChannelId: 'child-1',
          name: 'thread-a',
          type: 'thread' as const,
          parentChannelId: parent.id,
        },
        {
          tenantId: testTenantId,
          platformChannelId: 'child-2',
          name: 'thread-b',
          type: 'thread' as const,
          parentChannelId: parent.id,
        },
      ];

      for (const data of children) {
        await repository.create(data);
      }

      const found = await repository.findByParentId(parent.id);

      expect(found).toHaveLength(2);
      expect(found.map((c) => c.name).sort()).toEqual(['thread-a', 'thread-b']);
    });
  });

  describe('upsert', () => {
    it('should create a new channel if not exists', async () => {
      const data: CreateChannelData = {
        tenantId: testTenantId,
        platformChannelId: 'upsert-test',
        name: 'upsert-channel',
        type: 'text',
      };

      const channel = await repository.upsert(data);

      expect(channel).toBeDefined();
      expect(channel.name).toBe('upsert-channel');

      const count = await testContext.db
        .selectFrom('channels')
        .where('platform_channel_id', '=', 'upsert-test')
        .select((eb) => eb.fn.count('id').as('count'))
        .executeTakeFirst();

      expect(Number(count?.count)).toBe(1);
    });

    it('should update an existing channel', async () => {
      // Create initial channel
      const initial = await repository.create({
        tenantId: testTenantId,
        platformChannelId: 'update-test',
        name: 'old-name',
        type: 'text',
      });

      // Upsert with new data
      const updated = await repository.upsert({
        tenantId: testTenantId,
        platformChannelId: 'update-test',
        name: 'new-name',
        type: 'forum',
        metadata: { updated: true },
      });

      expect(updated.id).toBe(initial.id);
      expect(updated.name).toBe('new-name');
      expect(updated.type).toBe('forum');
      expect(updated.metadata).toEqual({ updated: true });
      expect(updated.updatedAt.getTime()).toBeGreaterThan(
        initial.updatedAt.getTime()
      );
    });
  });

  describe('update', () => {
    it('should update channel properties', async () => {
      const channel = await repository.create({
        tenantId: testTenantId,
        platformChannelId: 'update-props',
        name: 'original',
        type: 'text',
      });

      const updated = await repository.update(channel.id, {
        name: 'updated',
        metadata: { archived: true },
      });

      expect(updated).toBeDefined();
      expect(updated?.name).toBe('updated');
      expect(updated?.type).toBe('text'); // unchanged
      expect(updated?.metadata).toEqual({ archived: true });
    });
  });

  describe('delete', () => {
    it('should delete a channel', async () => {
      const channel = await repository.create({
        tenantId: testTenantId,
        platformChannelId: 'delete-test',
        name: 'to-delete',
        type: 'text',
      });

      const deleted = await repository.delete(channel.id);
      expect(deleted).toBe(true);

      const found = await repository.findById(channel.id);
      expect(found).toBeNull();
    });
  });
});
