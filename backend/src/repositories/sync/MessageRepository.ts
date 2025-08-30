import { Kysely } from 'kysely';
import { randomUUID } from 'crypto';
import { BaseCrudRepositoryImpl } from '../BaseCrudRepository.js';
import type { MessageRepository } from './types.js';
import type { PaginatedResult } from '../types.js';
import type { Message, CreateMessageData } from 'shared-types';
import type { Database } from '../../database/types.js';

/**
 * Implementation of MessageRepository using Kysely
 */
export class MessageRepositoryImpl
  extends BaseCrudRepositoryImpl<Message, CreateMessageData, never>
  implements MessageRepository
{
  constructor(db: Kysely<Database>) {
    super(db, 'messages');
  }

  /**
   * Find a message by platform message ID and channel ID
   */
  async findByPlatformId(
    channelId: string,
    platformMessageId: string
  ): Promise<Message | null> {
    const row = await this.db
      .selectFrom('messages')
      .selectAll()
      .where('channel_id', '=', channelId)
      .where('platform_message_id', '=', platformMessageId)
      .executeTakeFirst();

    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Find all messages in a channel with pagination
   */
  async findByChannel(
    channelId: string,
    options: {
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<PaginatedResult<Message>> {
    const { limit = 100, offset = 0, startDate, endDate } = options;

    let query = this.db
      .selectFrom('messages')
      .where('channel_id', '=', channelId);

    if (startDate) {
      query = query.where('platform_created_at', '>=', startDate);
    }
    if (endDate) {
      query = query.where('platform_created_at', '<=', endDate);
    }

    // Get total count
    const countQuery = await query
      .select((eb) => eb.fn.count('id').as('count'))
      .executeTakeFirst();

    const total = Number(countQuery?.count || 0);

    // Get paginated data
    const dataQuery = await query
      .selectAll()
      .orderBy('platform_created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    const data = dataQuery.map((row) => this.mapRowToEntity(row));

    return {
      data,
      pagination: {
        page: Math.floor(offset / limit) + 1,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find all messages in a channel with pagination, including attachments and reactions
   */
  async findByChannelWithExtras(
    channelId: string,
    options: {
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<PaginatedResult<any>> {
    const { limit = 100, offset = 0, startDate, endDate } = options;

    let query = this.db
      .selectFrom('messages')
      .where('channel_id', '=', channelId);

    if (startDate) {
      query = query.where('platform_created_at', '>=', startDate);
    }
    if (endDate) {
      query = query.where('platform_created_at', '<=', endDate);
    }

    // Get total count
    const countQuery = await query
      .select((eb) => eb.fn.count('id').as('count'))
      .executeTakeFirst();

    const total = Number(countQuery?.count || 0);

    // Get paginated messages
    const messages = await query
      .selectAll()
      .orderBy('platform_created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    // Get message IDs for fetching related data
    const messageIds = messages.map((m) => m.id);

    // Fetch attachments for all messages in batch
    const attachments =
      messageIds.length > 0
        ? await this.db
            .selectFrom('message_attachments')
            .selectAll()
            .where('message_id', 'in', messageIds)
            .execute()
        : [];

    // Fetch reactions for all messages in batch
    const reactions =
      messageIds.length > 0
        ? await this.db
            .selectFrom('message_emoji_reactions')
            .selectAll()
            .where('message_id', 'in', messageIds)
            .execute()
        : [];

    // Group attachments and reactions by message ID
    const attachmentsByMessage = attachments.reduce(
      (acc, att) => {
        if (!acc[att.message_id]) acc[att.message_id] = [];
        acc[att.message_id].push({
          id: att.id,
          messageId: att.message_id,
          filename: att.filename,
          fileSize: att.file_size,
          contentType: att.content_type,
          url: att.url,
          createdAt: new Date(att.created_at),
        });
        return acc;
      },
      {} as Record<string, any[]>
    );

    const reactionsByMessage = reactions.reduce(
      (acc, react) => {
        if (!acc[react.message_id]) acc[react.message_id] = [];
        acc[react.message_id].push({
          id: react.id,
          messageId: react.message_id,
          emoji: react.emoji,
          anonymizedUserId: react.anonymized_user_id,
          createdAt: new Date(react.created_at),
        });
        return acc;
      },
      {} as Record<string, any[]>
    );

    // Combine messages with their attachments and reactions
    const data = messages.map((row) => ({
      ...this.mapRowToEntity(row),
      attachments: attachmentsByMessage[row.id] || [],
      reactions: reactionsByMessage[row.id] || [],
    }));

    return {
      data,
      pagination: {
        page: Math.floor(offset / limit) + 1,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find all replies to a specific message
   */
  async findReplies(messageId: string): Promise<Message[]> {
    const rows = await this.db
      .selectFrom('messages')
      .selectAll()
      .where('reply_to_id', '=', messageId)
      .orderBy('platform_created_at', 'desc')
      .execute();

    return rows.map((row) => this.mapRowToEntity(row));
  }

  /**
   * Bulk insert messages
   */
  async bulkCreate(messages: CreateMessageData[]): Promise<Message[]> {
    if (messages.length === 0) return [];

    const insertData = messages.map((msg) => this.mapCreateDataToRow(msg));

    await this.db.insertInto('messages').values(insertData).execute();

    // Fetch the inserted rows
    const platformMessageIds = messages.map((msg) => msg.platformMessageId);
    const channelIds = [...new Set(messages.map((msg) => msg.channelId))];

    const rows = await this.db
      .selectFrom('messages')
      .selectAll()
      .where('platform_message_id', 'in', platformMessageIds)
      .where('channel_id', 'in', channelIds)
      .execute();

    return rows.map((row) => this.mapRowToEntity(row));
  }

  /**
   * Bulk upsert messages (create if not exists, skip if exists)
   */
  async bulkUpsert(messages: CreateMessageData[]): Promise<{
    created: Message[];
    skipped: number;
  }> {
    if (messages.length === 0) return { created: [], skipped: 0 };

    const insertData = messages.map((msg) => this.mapCreateDataToRow(msg));
    const created: Message[] = [];
    let skipped = 0;

    // MySQL doesn't support RETURNING with ON DUPLICATE KEY UPDATE
    // So we need to insert one by one and track what was created
    for (const data of insertData) {
      try {
        await this.db.insertInto('messages').values(data).execute();

        // If insert succeeded, fetch the created row
        const row = await this.db
          .selectFrom('messages')
          .selectAll()
          .where('id', '=', data.id)
          .executeTakeFirst();

        if (row) {
          created.push(this.mapRowToEntity(row));
        }
      } catch (error: any) {
        // If duplicate key error, count as skipped
        if (error?.code === 'ER_DUP_ENTRY') {
          skipped++;
        } else {
          throw error;
        }
      }
    }

    return { created, skipped };
  }

  /**
   * Count messages in a channel
   */
  async countByChannel(channelId: string): Promise<number> {
    const result = await this.db
      .selectFrom('messages')
      .where('channel_id', '=', channelId)
      .select((eb) => eb.fn.count('id').as('count'))
      .executeTakeFirst();

    return Number(result?.count || 0);
  }

  /**
   * Get the latest message in a channel
   */
  async getLatestByChannel(channelId: string): Promise<Message | null> {
    const row = await this.db
      .selectFrom('messages')
      .selectAll()
      .where('channel_id', '=', channelId)
      .orderBy('platform_created_at', 'desc')
      .limit(1)
      .executeTakeFirst();

    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Map database row to domain entity
   */
  protected mapRowToEntity(row: any): Message {
    return {
      id: row.id,
      channelId: row.channel_id,
      platformMessageId: row.platform_message_id,
      anonymizedAuthorId: row.anonymized_author_id,
      content: row.content,
      replyToId: row.reply_to_id,
      metadata: row.metadata || {},
      platformCreatedAt: new Date(row.platform_created_at),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Map create data to database row format
   */
  protected mapCreateDataToRow(data: CreateMessageData): any {
    return {
      id: randomUUID(),
      channel_id: data.channelId,
      platform_message_id: data.platformMessageId,
      anonymized_author_id: data.anonymizedAuthorId,
      content: data.content,
      reply_to_id: data.replyToId || null,
      metadata: JSON.stringify(data.metadata || {}),
      platform_created_at: data.platformCreatedAt.toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Map update data to database row format
   * Note: Messages are immutable, so this is not implemented
   */
  protected mapUpdateDataToRow(_data: never): any {
    throw new Error('Messages cannot be updated');
  }
}
