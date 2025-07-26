import { Kysely, sql } from 'kysely';
import { BaseCrudRepositoryImpl } from '../BaseCrudRepository.js';
import type { MessageEmojiReactionRepository } from './types.js';
import type {
  MessageEmojiReaction,
  CreateMessageEmojiReactionData,
} from '../../types/sync.js';
import type { Database } from '../../database/types.js';

/**
 * Implementation of MessageEmojiReactionRepository using Kysely
 */
export class MessageEmojiReactionRepositoryImpl
  extends BaseCrudRepositoryImpl<
    MessageEmojiReaction,
    CreateMessageEmojiReactionData,
    never
  >
  implements MessageEmojiReactionRepository
{
  constructor(db: Kysely<Database>) {
    super(db, 'message_emoji_reactions');
  }

  /**
   * Find all reactions for a message
   */
  async findByMessage(messageId: string): Promise<MessageEmojiReaction[]> {
    const rows = await this.db
      .selectFrom('message_emoji_reactions')
      .selectAll()
      .where('message_id', '=', messageId)
      .orderBy('created_at', 'asc')
      .execute();

    return rows.map((row) => this.mapRowToEntity(row));
  }

  /**
   * Find all reactions by a specific user
   */
  async findByUser(anonymizedUserId: string): Promise<MessageEmojiReaction[]> {
    const rows = await this.db
      .selectFrom('message_emoji_reactions')
      .selectAll()
      .where('anonymized_user_id', '=', anonymizedUserId)
      .orderBy('created_at', 'desc')
      .execute();

    return rows.map((row) => this.mapRowToEntity(row));
  }

  /**
   * Find a specific reaction by user and emoji
   */
  async findByUserAndEmoji(
    messageId: string,
    anonymizedUserId: string,
    emoji: string
  ): Promise<MessageEmojiReaction | null> {
    const row = await this.db
      .selectFrom('message_emoji_reactions')
      .selectAll()
      .where('message_id', '=', messageId)
      .where('anonymized_user_id', '=', anonymizedUserId)
      .where('emoji', '=', emoji)
      .executeTakeFirst();

    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Bulk create reactions
   */
  async bulkCreate(
    reactions: CreateMessageEmojiReactionData[]
  ): Promise<MessageEmojiReaction[]> {
    if (reactions.length === 0) return [];

    const insertData = reactions.map((reaction) =>
      this.mapCreateDataToRow(reaction)
    );

    // Use ON CONFLICT DO NOTHING to skip existing reactions
    const rows = await this.db
      .insertInto('message_emoji_reactions')
      .values(insertData)
      .onConflict((oc) =>
        oc.columns(['message_id', 'anonymized_user_id', 'emoji']).doNothing()
      )
      .returningAll()
      .execute();

    return rows.map((row) => this.mapRowToEntity(row));
  }

  /**
   * Delete all reactions for a message
   */
  async deleteByMessage(messageId: string): Promise<number> {
    const result = await this.db
      .deleteFrom('message_emoji_reactions')
      .where('message_id', '=', messageId)
      .executeTakeFirst();

    return Number(result.numDeletedRows);
  }

  /**
   * Delete a specific user's reaction
   */
  async deleteByUserAndEmoji(
    messageId: string,
    anonymizedUserId: string,
    emoji: string
  ): Promise<boolean> {
    const result = await this.db
      .deleteFrom('message_emoji_reactions')
      .where('message_id', '=', messageId)
      .where('anonymized_user_id', '=', anonymizedUserId)
      .where('emoji', '=', emoji)
      .executeTakeFirst();

    return Number(result.numDeletedRows) > 0;
  }

  /**
   * Map database row to domain entity
   */
  protected mapRowToEntity(row: any): MessageEmojiReaction {
    return {
      id: row.id,
      messageId: row.message_id,
      emoji: row.emoji,
      anonymizedUserId: row.anonymized_user_id,
      createdAt: new Date(row.created_at),
    };
  }

  /**
   * Map create data to database row format
   */
  protected mapCreateDataToRow(data: CreateMessageEmojiReactionData): any {
    return {
      id: sql`gen_random_uuid()`,
      message_id: data.messageId,
      emoji: data.emoji,
      anonymized_user_id: data.anonymizedUserId,
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Map update data to database row format
   * Note: Emoji reactions are immutable, so this is not implemented
   */
  protected mapUpdateDataToRow(_data: never): any {
    throw new Error('Message emoji reactions cannot be updated');
  }
}
