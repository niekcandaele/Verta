import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MessageRepositoryImpl } from '../MessageRepository.js';
import {
  createTestDatabase,
  destroyTestDatabase,
  type TestDatabaseContext,
} from '../../../test/testcontainers-setup.js';
import type { CreateMessageData } from '../../../types/sync.js';
import { anonymizeUserId } from '../../../utils/crypto.js';

describe('MessageRepository', () => {
  let testContext: TestDatabaseContext;
  let repository: MessageRepositoryImpl;
  let testTenantId: string;
  let testChannelId: string;

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

    // Create test channel
    const channel = await testContext.db
      .insertInto('channels')
      .values({
        tenant_id: testTenantId,
        platform_channel_id: 'test-channel',
        name: 'general',
        type: 'text',
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    testChannelId = channel.id;
    repository = new MessageRepositoryImpl(testContext.db);
  });

  afterAll(async () => {
    await destroyTestDatabase(testContext);
  });

  beforeEach(async () => {
    // Clean up messages between tests
    await testContext.db.deleteFrom('messages').execute();
  });

  describe('create', () => {
    it('should create a new message', async () => {
      const messageData: CreateMessageData = {
        channelId: testChannelId,
        platformMessageId: 'msg-123',
        anonymizedAuthorId: anonymizeUserId('user123'),
        content: 'Hello, world!',
        platformCreatedAt: new Date('2024-01-01T12:00:00Z'),
      };

      const message = await repository.create(messageData);

      expect(message).toBeDefined();
      expect(message.id).toBeDefined();
      expect(message.channelId).toBe(testChannelId);
      expect(message.platformMessageId).toBe('msg-123');
      expect(message.content).toBe('Hello, world!');
      expect(message.replyToId).toBeNull();
      expect(message.metadata).toEqual({});
    });

    it('should create a reply message', async () => {
      // Create original message
      const original = await repository.create({
        channelId: testChannelId,
        platformMessageId: 'original-msg',
        anonymizedAuthorId: anonymizeUserId('user1'),
        content: 'Original message',
        platformCreatedAt: new Date('2024-01-01T10:00:00Z'),
      });

      // Create reply
      const replyData: CreateMessageData = {
        channelId: testChannelId,
        platformMessageId: 'reply-msg',
        anonymizedAuthorId: anonymizeUserId('user2'),
        content: 'This is a reply',
        replyToId: original.id,
        platformCreatedAt: new Date('2024-01-01T10:05:00Z'),
      };

      const reply = await repository.create(replyData);

      expect(reply.replyToId).toBe(original.id);
    });
  });

  describe('findByPlatformId', () => {
    it('should find a message by platform ID and channel ID', async () => {
      const created = await repository.create({
        channelId: testChannelId,
        platformMessageId: 'find-test',
        anonymizedAuthorId: anonymizeUserId('user123'),
        content: 'Find me!',
        platformCreatedAt: new Date(),
      });

      const found = await repository.findByPlatformId(
        testChannelId,
        'find-test'
      );

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.content).toBe('Find me!');
    });

    it('should return null for non-existent message', async () => {
      const found = await repository.findByPlatformId(
        testChannelId,
        'non-existent'
      );

      expect(found).toBeNull();
    });
  });

  describe('findByChannel', () => {
    it('should find messages in a channel with pagination', async () => {
      // Create 15 messages
      const messages = [];
      for (let i = 0; i < 15; i++) {
        messages.push({
          channelId: testChannelId,
          platformMessageId: `msg-${i}`,
          anonymizedAuthorId: anonymizeUserId(`user${i % 3}`),
          content: `Message ${i}`,
          platformCreatedAt: new Date(`2024-01-01T${10 + i}:00:00Z`),
        });
      }

      await repository.bulkCreate(messages);

      // Get first page
      const page1 = await repository.findByChannel(testChannelId, {
        limit: 10,
        offset: 0,
      });

      expect(page1.data).toHaveLength(10);
      expect(page1.pagination.total).toBe(15);
      expect(page1.pagination.totalPages).toBe(2);
      expect(page1.pagination.page).toBe(1);

      // Get second page
      const page2 = await repository.findByChannel(testChannelId, {
        limit: 10,
        offset: 10,
      });

      expect(page2.data).toHaveLength(5);
      expect(page2.pagination.page).toBe(2);
    });

    it('should filter messages by date range', async () => {
      const messages = [
        {
          channelId: testChannelId,
          platformMessageId: 'early',
          anonymizedAuthorId: anonymizeUserId('user1'),
          content: 'Early message',
          platformCreatedAt: new Date('2024-01-01T08:00:00Z'),
        },
        {
          channelId: testChannelId,
          platformMessageId: 'middle',
          anonymizedAuthorId: anonymizeUserId('user2'),
          content: 'Middle message',
          platformCreatedAt: new Date('2024-01-01T12:00:00Z'),
        },
        {
          channelId: testChannelId,
          platformMessageId: 'late',
          anonymizedAuthorId: anonymizeUserId('user3'),
          content: 'Late message',
          platformCreatedAt: new Date('2024-01-01T16:00:00Z'),
        },
      ];

      await repository.bulkCreate(messages);

      const filtered = await repository.findByChannel(testChannelId, {
        startDate: new Date('2024-01-01T10:00:00Z'),
        endDate: new Date('2024-01-01T14:00:00Z'),
      });

      expect(filtered.data).toHaveLength(1);
      expect(filtered.data[0].content).toBe('Middle message');
    });
  });

  describe('findReplies', () => {
    it('should find all replies to a message', async () => {
      const original = await repository.create({
        channelId: testChannelId,
        platformMessageId: 'original',
        anonymizedAuthorId: anonymizeUserId('op'),
        content: 'Original post',
        platformCreatedAt: new Date('2024-01-01T10:00:00Z'),
      });

      const replies = [];
      for (let i = 0; i < 3; i++) {
        replies.push({
          channelId: testChannelId,
          platformMessageId: `reply-${i}`,
          anonymizedAuthorId: anonymizeUserId(`replier${i}`),
          content: `Reply ${i}`,
          replyToId: original.id,
          platformCreatedAt: new Date(`2024-01-01T10:${i + 1}0:00Z`),
        });
      }

      await repository.bulkCreate(replies);

      const found = await repository.findReplies(original.id);

      expect(found).toHaveLength(3);
      expect(found.map((r) => r.content)).toEqual([
        'Reply 0',
        'Reply 1',
        'Reply 2',
      ]);
    });
  });

  describe('bulkCreate', () => {
    it('should create multiple messages', async () => {
      const messages: CreateMessageData[] = [
        {
          channelId: testChannelId,
          platformMessageId: 'bulk-1',
          anonymizedAuthorId: anonymizeUserId('user1'),
          content: 'First bulk message',
          platformCreatedAt: new Date('2024-01-01T10:00:00Z'),
        },
        {
          channelId: testChannelId,
          platformMessageId: 'bulk-2',
          anonymizedAuthorId: anonymizeUserId('user2'),
          content: 'Second bulk message',
          platformCreatedAt: new Date('2024-01-01T10:01:00Z'),
        },
        {
          channelId: testChannelId,
          platformMessageId: 'bulk-3',
          anonymizedAuthorId: anonymizeUserId('user3'),
          content: 'Third bulk message',
          platformCreatedAt: new Date('2024-01-01T10:02:00Z'),
        },
      ];

      const created = await repository.bulkCreate(messages);

      expect(created).toHaveLength(3);
      expect(created.map((m) => m.content)).toEqual([
        'First bulk message',
        'Second bulk message',
        'Third bulk message',
      ]);
    });

    it('should handle empty array', async () => {
      const created = await repository.bulkCreate([]);
      expect(created).toEqual([]);
    });
  });

  describe('bulkUpsert', () => {
    it('should create new messages and skip existing ones', async () => {
      // Create an existing message
      await repository.create({
        channelId: testChannelId,
        platformMessageId: 'existing',
        anonymizedAuthorId: anonymizeUserId('user1'),
        content: 'Existing message',
        platformCreatedAt: new Date('2024-01-01T10:00:00Z'),
      });

      const messages: CreateMessageData[] = [
        {
          channelId: testChannelId,
          platformMessageId: 'existing', // Should be skipped
          anonymizedAuthorId: anonymizeUserId('user1'),
          content: 'Updated content',
          platformCreatedAt: new Date('2024-01-01T10:00:00Z'),
        },
        {
          channelId: testChannelId,
          platformMessageId: 'new-1',
          anonymizedAuthorId: anonymizeUserId('user2'),
          content: 'New message 1',
          platformCreatedAt: new Date('2024-01-01T10:01:00Z'),
        },
        {
          channelId: testChannelId,
          platformMessageId: 'new-2',
          anonymizedAuthorId: anonymizeUserId('user3'),
          content: 'New message 2',
          platformCreatedAt: new Date('2024-01-01T10:02:00Z'),
        },
      ];

      const result = await repository.bulkUpsert(messages);

      expect(result.created).toHaveLength(2);
      expect(result.skipped).toBe(1);
      expect(result.created.map((m) => m.content)).toEqual([
        'New message 1',
        'New message 2',
      ]);

      // Verify existing message wasn't updated
      const existing = await repository.findByPlatformId(
        testChannelId,
        'existing'
      );
      expect(existing?.content).toBe('Existing message');
    });
  });

  describe('countByChannel', () => {
    it('should count messages in a channel', async () => {
      const messages = [];
      for (let i = 0; i < 5; i++) {
        messages.push({
          channelId: testChannelId,
          platformMessageId: `count-${i}`,
          anonymizedAuthorId: anonymizeUserId('user'),
          content: `Message ${i}`,
          platformCreatedAt: new Date(),
        });
      }

      await repository.bulkCreate(messages);

      const count = await repository.countByChannel(testChannelId);
      expect(count).toBe(5);
    });

    it('should return 0 for empty channel', async () => {
      const count = await repository.countByChannel(testChannelId);
      expect(count).toBe(0);
    });
  });

  describe('getLatestByChannel', () => {
    it('should get the latest message in a channel', async () => {
      const messages = [
        {
          channelId: testChannelId,
          platformMessageId: 'early',
          anonymizedAuthorId: anonymizeUserId('user1'),
          content: 'Early message',
          platformCreatedAt: new Date('2024-01-01T08:00:00Z'),
        },
        {
          channelId: testChannelId,
          platformMessageId: 'latest',
          anonymizedAuthorId: anonymizeUserId('user2'),
          content: 'Latest message',
          platformCreatedAt: new Date('2024-01-01T18:00:00Z'),
        },
        {
          channelId: testChannelId,
          platformMessageId: 'middle',
          anonymizedAuthorId: anonymizeUserId('user3'),
          content: 'Middle message',
          platformCreatedAt: new Date('2024-01-01T12:00:00Z'),
        },
      ];

      await repository.bulkCreate(messages);

      const latest = await repository.getLatestByChannel(testChannelId);

      expect(latest).toBeDefined();
      expect(latest?.content).toBe('Latest message');
      expect(latest?.platformMessageId).toBe('latest');
    });

    it('should return null for empty channel', async () => {
      const latest = await repository.getLatestByChannel(testChannelId);
      expect(latest).toBeNull();
    });
  });
});
