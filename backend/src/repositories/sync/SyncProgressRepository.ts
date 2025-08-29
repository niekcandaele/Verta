import { Kysely } from 'kysely';
import { randomUUID } from 'crypto';
import { BaseCrudRepositoryImpl } from '../BaseCrudRepository.js';
import type { SyncProgressRepository } from './types.js';
import type {
  SyncProgress,
  CreateSyncProgressData,
  UpdateSyncProgressData,
} from 'shared-types';
import type { Database, SyncStatus } from '../../database/types.js';

/**
 * Implementation of SyncProgressRepository using Kysely
 */
export class SyncProgressRepositoryImpl
  extends BaseCrudRepositoryImpl<
    SyncProgress,
    CreateSyncProgressData,
    UpdateSyncProgressData
  >
  implements SyncProgressRepository
{
  constructor(db: Kysely<Database>) {
    super(db, 'sync_progress');
  }

  /**
   * Find sync progress for a specific channel
   */
  async findByChannel(channelId: string): Promise<SyncProgress | null> {
    const row = await this.db
      .selectFrom('sync_progress')
      .selectAll()
      .where('channel_id', '=', channelId)
      .executeTakeFirst();

    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Find all sync progress for a tenant
   */
  async findByTenant(tenantId: string): Promise<SyncProgress[]> {
    const rows = await this.db
      .selectFrom('sync_progress')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .orderBy('last_synced_at', 'desc')
      .execute();

    return rows.map((row) => this.mapRowToEntity(row));
  }

  /**
   * Find sync progress by tenant and channel
   */
  async findByTenantAndChannel(
    tenantId: string,
    channelId: string
  ): Promise<SyncProgress | null> {
    const row = await this.db
      .selectFrom('sync_progress')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('channel_id', '=', channelId)
      .executeTakeFirst();

    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Update or create sync progress (upsert)
   */
  async upsert(data: CreateSyncProgressData): Promise<SyncProgress> {
    const insertData = this.mapCreateDataToRow(data);

    // MySQL UPSERT - First try to insert
    try {
      await this.db
        .insertInto('sync_progress')
        .values(insertData)
        .execute();
    } catch (error: any) {
      // If duplicate key error, update the existing record
      if (error?.code === 'ER_DUP_ENTRY') {
        await this.db
          .updateTable('sync_progress')
          .set({
            last_synced_message_id: insertData.last_synced_message_id,
            last_synced_at: insertData.last_synced_at,
            status: insertData.status,
            error_details: insertData.error_details,
            updated_at: new Date().toISOString(),
          })
          .where('tenant_id', '=', insertData.tenant_id)
          .where('channel_id', '=', insertData.channel_id)
          .execute();
      } else {
        throw error;
      }
    }

    // Fetch the row to return it
    const row = await this.db
      .selectFrom('sync_progress')
      .selectAll()
      .where('tenant_id', '=', insertData.tenant_id)
      .where('channel_id', '=', insertData.channel_id)
      .executeTakeFirstOrThrow();

    return this.mapRowToEntity(row);
  }

  /**
   * Mark sync as failed with error details
   */
  async markFailed(
    channelId: string,
    errorDetails: unknown
  ): Promise<SyncProgress | null> {
    await this.db
      .updateTable('sync_progress')
      .set({
        status: 'failed' as SyncStatus,
        error_details: JSON.stringify(errorDetails),
        updated_at: new Date().toISOString(),
      })
      .where('channel_id', '=', channelId)
      .execute();

    const row = await this.db
      .selectFrom('sync_progress')
      .selectAll()
      .where('channel_id', '=', channelId)
      .executeTakeFirst();

    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Mark sync as completed
   */
  async markCompleted(
    channelId: string,
    lastSyncedMessageId: string,
    lastSyncedAt: Date
  ): Promise<SyncProgress | null> {
    await this.db
      .updateTable('sync_progress')
      .set({
        last_synced_message_id: lastSyncedMessageId,
        last_synced_at: lastSyncedAt.toISOString(),
        status: 'completed' as SyncStatus,
        error_details: null,
        updated_at: new Date().toISOString(),
      })
      .where('channel_id', '=', channelId)
      .execute();

    const row = await this.db
      .selectFrom('sync_progress')
      .selectAll()
      .where('channel_id', '=', channelId)
      .executeTakeFirst();

    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Get channels that need syncing for a tenant
   */
  async getChannelsNeedingSync(
    tenantId: string,
    olderThan?: Date
  ): Promise<Array<{ channelId: string; lastSyncedAt: Date | null }>> {
    let query = this.db
      .selectFrom('channels as c')
      .leftJoin('sync_progress as sp', (join) =>
        join
          .onRef('c.id', '=', 'sp.channel_id')
          .onRef('c.tenant_id', '=', 'sp.tenant_id')
      )
      .where('c.tenant_id', '=', tenantId)
      .select(['c.id as channelId', 'sp.last_synced_at as lastSyncedAt']);

    // Include channels that have never been synced or synced before the specified date
    if (olderThan) {
      query = query.where((eb) =>
        eb.or([
          eb('sp.last_synced_at', 'is', null),
          eb('sp.last_synced_at', '<', olderThan),
        ])
      );
    }

    const rows = await query.execute();

    return rows.map((row) => ({
      channelId: row.channelId,
      lastSyncedAt: row.lastSyncedAt ? new Date(row.lastSyncedAt) : null,
    }));
  }

  /**
   * Delete sync progress for a channel
   */
  async deleteByChannel(channelId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('sync_progress')
      .where('channel_id', '=', channelId)
      .executeTakeFirst();

    return Number(result.numDeletedRows) > 0;
  }

  /**
   * Claim a channel for a worker (atomic operation)
   */
  async claimChannel(
    channelId: string,
    workerId: string
  ): Promise<SyncProgress | null> {
    // First, get the channel's tenant_id
    const channel = await this.db
      .selectFrom('channels')
      .select(['tenant_id'])
      .where('id', '=', channelId)
      .executeTakeFirst();

    if (!channel) {
      return null;
    }

    // Try to insert or update the sync progress
    const newId = randomUUID();
    try {
      // First attempt: try to insert a new record
      await this.db
        .insertInto('sync_progress')
        .values({
          id: newId,
          tenant_id: channel.tenant_id,
          channel_id: channelId,
          worker_id: workerId,
          status: 'in_progress' as SyncStatus,
          started_at: new Date().toISOString(),
          last_synced_message_id: '',
          last_synced_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      const insertedRow = await this.db
        .selectFrom('sync_progress')
        .selectAll()
        .where('id', '=', newId)
        .executeTakeFirst();

      return insertedRow ? this.mapRowToEntity(insertedRow) : null;
    } catch {
      // If insert fails due to unique constraint, try to update
      await this.db
        .updateTable('sync_progress')
        .set({
          worker_id: workerId,
          status: 'in_progress' as SyncStatus,
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .where('channel_id', '=', channelId)
        .where((eb) =>
          eb.or([
            eb('worker_id', 'is', null),
            eb('worker_id', '=', workerId),
            eb('status', '!=', 'in_progress'),
          ])
        )
        .execute();

      const row = await this.db
        .selectFrom('sync_progress')
        .selectAll()
        .where('channel_id', '=', channelId)
        .executeTakeFirst();

      return row ? this.mapRowToEntity(row) : null;
    }
  }

  /**
   * Release a channel from a worker
   */
  async releaseChannel(
    channelId: string,
    workerId: string
  ): Promise<SyncProgress | null> {
    await this.db
      .updateTable('sync_progress')
      .set({
        worker_id: null,
        updated_at: new Date().toISOString(),
      })
      .where('channel_id', '=', channelId)
      .where('worker_id', '=', workerId)
      .execute();

    const row = await this.db
      .selectFrom('sync_progress')
      .selectAll()
      .where('channel_id', '=', channelId)
      .executeTakeFirst();

    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Find all sync progress assigned to a worker
   */
  async findByWorkerId(workerId: string): Promise<SyncProgress[]> {
    const rows = await this.db
      .selectFrom('sync_progress')
      .selectAll()
      .where('worker_id', '=', workerId)
      .orderBy('started_at', 'desc')
      .execute();

    return rows.map((row) => this.mapRowToEntity(row));
  }

  /**
   * Map database row to domain entity
   */
  protected mapRowToEntity(row: any): SyncProgress {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      channelId: row.channel_id,
      lastSyncedMessageId: row.last_synced_message_id,
      lastSyncedAt: new Date(row.last_synced_at),
      status: row.status as SyncStatus,
      errorDetails: row.error_details,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      // Additional fields for worker tracking
      workerId: row.worker_id,
      startedAt: row.started_at ? new Date(row.started_at) : undefined,
      messagesPerSecond: row.messages_per_second
        ? Number(row.messages_per_second)
        : undefined,
    } as SyncProgress & {
      workerId?: string;
      startedAt?: Date;
      messagesPerSecond?: number;
    };
  }

  /**
   * Map create data to database row format
   */
  protected mapCreateDataToRow(data: CreateSyncProgressData): any {
    return {
      id: randomUUID(),
      tenant_id: data.tenantId,
      channel_id: data.channelId,
      last_synced_message_id: data.lastSyncedMessageId,
      last_synced_at: data.lastSyncedAt.toISOString(),
      status: data.status,
      error_details: data.errorDetails
        ? JSON.stringify(data.errorDetails)
        : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Map update data to database row format
   */
  protected mapUpdateDataToRow(data: UpdateSyncProgressData): any {
    const row: any = {};

    if (data.lastSyncedMessageId !== undefined) {
      row.last_synced_message_id = data.lastSyncedMessageId;
    }
    if (data.lastSyncedAt !== undefined) {
      row.last_synced_at = data.lastSyncedAt.toISOString();
    }
    if (data.status !== undefined) {
      row.status = data.status;
    }
    if (data.errorDetails !== undefined) {
      row.error_details = data.errorDetails
        ? JSON.stringify(data.errorDetails)
        : null;
    }

    return row;
  }
}
