import { z } from 'zod';

/**
 * Validation schemas for sync-related data
 */

// Enum schemas
export const ChannelTypeSchema = z.enum(['text', 'thread', 'forum']);
export const SyncStatusSchema = z.enum(['in_progress', 'completed', 'failed']);
export const SyncTypeSchema = z.enum(['full', 'incremental']);

// Channel schemas
export const CreateChannelSchema = z.object({
  tenantId: z.string().uuid(),
  platformChannelId: z.string().min(1),
  name: z.string().min(1).max(100),
  type: ChannelTypeSchema,
  parentChannelId: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const UpdateChannelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: ChannelTypeSchema.optional(),
  parentChannelId: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// Message schemas
export const CreateMessageSchema = z.object({
  channelId: z.string().uuid(),
  platformMessageId: z.string().min(1),
  anonymizedAuthorId: z.string().regex(/^[a-f0-9]{64}$/), // SHA-256 hash
  content: z.string(),
  replyToId: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  platformCreatedAt: z.date(),
});

// Bulk message insert schema
export const CreateMessagesSchema = z
  .array(CreateMessageSchema)
  .min(1)
  .max(1000);

// Message emoji reaction schemas
export const CreateMessageEmojiReactionSchema = z.object({
  messageId: z.string().uuid(),
  emoji: z.string().min(1).max(100), // Supports both standard emoji and custom emoji strings
  anonymizedUserId: z.string().regex(/^[a-f0-9]{64}$/), // SHA-256 hash
});

// Bulk emoji reactions insert schema
export const CreateMessageEmojiReactionsSchema = z
  .array(CreateMessageEmojiReactionSchema)
  .min(1)
  .max(1000);

// Message attachment schemas
export const CreateMessageAttachmentSchema = z.object({
  messageId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  fileSize: z.union([z.bigint().positive(), z.number().int().positive()]),
  contentType: z.string().min(1).max(100),
  url: z.string().url(),
});

// Bulk attachments insert schema
export const CreateMessageAttachmentsSchema = z
  .array(CreateMessageAttachmentSchema)
  .min(1)
  .max(1000);

// Sync progress schemas
export const CreateSyncProgressSchema = z.object({
  tenantId: z.string().uuid(),
  channelId: z.string().uuid(),
  lastSyncedMessageId: z.string().min(1),
  lastSyncedAt: z.date(),
  status: SyncStatusSchema,
  errorDetails: z.unknown().optional(),
});

export const UpdateSyncProgressSchema = z.object({
  lastSyncedMessageId: z.string().min(1).optional(),
  lastSyncedAt: z.date().optional(),
  status: SyncStatusSchema.optional(),
  errorDetails: z.unknown().optional(),
});

// BullMQ job data schemas
export const SyncJobDataSchema = z.object({
  tenantId: z.string().uuid(),
  syncType: SyncTypeSchema,
  channelIds: z.array(z.string()).optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
});

// Sync checkpoint schema
export const SyncCheckpointSchema = z.object({
  channelId: z.string().uuid(),
  lastMessageId: z.string().min(1),
  lastMessageTimestamp: z.date(),
  messagesProcessed: z.number().int().nonnegative(),
  hasMoreMessages: z.boolean(),
});

// Platform data schemas
export const PlatformChannelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['text', 'thread', 'forum', 'voice', 'category']),
  parentId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const PlatformMessageSchema = z.object({
  id: z.string().min(1),
  channelId: z.string().min(1),
  authorId: z.string().min(1),
  content: z.string(),
  replyToId: z.string().optional(),
  createdAt: z.date(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  reactions: z
    .array(
      z.object({
        emoji: z.string().min(1),
        users: z.array(z.string().min(1)),
      })
    )
    .optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string().min(1),
        fileSize: z.number().positive(),
        contentType: z.string().min(1),
        url: z.string().url(),
      })
    )
    .optional(),
});

// Query parameter schemas
export const ChannelQuerySchema = z.object({
  tenantId: z.string().uuid().optional(),
  type: ChannelTypeSchema.optional(),
  parentChannelId: z.string().uuid().nullable().optional(),
});

export const MessageQuerySchema = z.object({
  channelId: z.string().uuid().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  limit: z.number().int().positive().max(1000).default(100),
  offset: z.number().int().nonnegative().default(0),
});

export const SyncProgressQuerySchema = z.object({
  tenantId: z.string().uuid().optional(),
  channelId: z.string().uuid().optional(),
  status: SyncStatusSchema.optional(),
});

// Type exports
export type CreateChannelData = z.infer<typeof CreateChannelSchema>;
export type UpdateChannelData = z.infer<typeof UpdateChannelSchema>;
export type CreateMessageData = z.infer<typeof CreateMessageSchema>;
export type CreateMessagesData = z.infer<typeof CreateMessagesSchema>;
export type CreateMessageEmojiReactionData = z.infer<
  typeof CreateMessageEmojiReactionSchema
>;
export type CreateMessageEmojiReactionsData = z.infer<
  typeof CreateMessageEmojiReactionsSchema
>;
export type CreateMessageAttachmentData = z.infer<
  typeof CreateMessageAttachmentSchema
>;
export type CreateMessageAttachmentsData = z.infer<
  typeof CreateMessageAttachmentsSchema
>;
export type CreateSyncProgressData = z.infer<typeof CreateSyncProgressSchema>;
export type UpdateSyncProgressData = z.infer<typeof UpdateSyncProgressSchema>;
export type SyncJobData = z.infer<typeof SyncJobDataSchema>;
export type SyncCheckpoint = z.infer<typeof SyncCheckpointSchema>;
export type PlatformChannel = z.infer<typeof PlatformChannelSchema>;
export type PlatformMessage = z.infer<typeof PlatformMessageSchema>;
