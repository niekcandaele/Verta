import { Kysely } from 'kysely';
import { randomUUID } from 'crypto';
import { BaseCrudRepositoryImpl } from '../BaseCrudRepository.js';
import type { MessageAttachmentRepository } from './types.js';
import type {
  MessageAttachment,
  CreateMessageAttachmentData,
} from 'shared-types';
import type { Database } from '../../database/types.js';

/**
 * Implementation of MessageAttachmentRepository using Kysely
 */
export class MessageAttachmentRepositoryImpl
  extends BaseCrudRepositoryImpl<
    MessageAttachment,
    CreateMessageAttachmentData,
    never
  >
  implements MessageAttachmentRepository
{
  constructor(db: Kysely<Database>) {
    super(db, 'message_attachments');
  }

  /**
   * Find all attachments for a message
   */
  async findByMessage(messageId: string): Promise<MessageAttachment[]> {
    const rows = await this.db
      .selectFrom('message_attachments')
      .selectAll()
      .where('message_id', '=', messageId)
      .orderBy('created_at', 'asc')
      .execute();

    return rows.map((row) => this.mapRowToEntity(row));
  }

  /**
   * Bulk create attachments
   */
  async bulkCreate(
    attachments: CreateMessageAttachmentData[]
  ): Promise<MessageAttachment[]> {
    if (attachments.length === 0) return [];

    const insertData = attachments.map((attachment) =>
      this.mapCreateDataToRow(attachment)
    );

    await this.db
      .insertInto('message_attachments')
      .values(insertData)
      .execute();

    // Fetch the inserted rows
    const ids = insertData.map((data) => data.id);
    const rows = await this.db
      .selectFrom('message_attachments')
      .selectAll()
      .where('id', 'in', ids)
      .execute();

    return rows.map((row) => this.mapRowToEntity(row));
  }

  /**
   * Delete all attachments for a message
   */
  async deleteByMessage(messageId: string): Promise<number> {
    const result = await this.db
      .deleteFrom('message_attachments')
      .where('message_id', '=', messageId)
      .executeTakeFirst();

    return Number(result.numDeletedRows);
  }

  /**
   * Get total attachment size for a channel
   */
  async getTotalSizeByChannel(channelId: string): Promise<bigint> {
    const result = await this.db
      .selectFrom('message_attachments as ma')
      .innerJoin('messages as m', 'm.id', 'ma.message_id')
      .where('m.channel_id', '=', channelId)
      .select((eb) => eb.fn.sum('ma.file_size').as('total_size'))
      .executeTakeFirst();

    return BigInt(result?.total_size || 0);
  }

  /**
   * Map database row to domain entity
   */
  protected mapRowToEntity(row: any): MessageAttachment {
    return {
      id: row.id,
      messageId: row.message_id,
      filename: row.filename,
      fileSize: BigInt(row.file_size),
      contentType: row.content_type,
      url: row.url,
      createdAt: new Date(row.created_at),
    };
  }

  /**
   * Map create data to database row format
   */
  protected mapCreateDataToRow(data: CreateMessageAttachmentData): any {
    return {
      id: randomUUID(),
      message_id: data.messageId,
      filename: data.filename,
      file_size: data.fileSize.toString(),
      content_type: data.contentType,
      url: data.url,
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Map update data to database row format
   * Note: Attachments are immutable, so this is not implemented
   */
  protected mapUpdateDataToRow(_data: never): any {
    throw new Error('Message attachments cannot be updated');
  }
}
