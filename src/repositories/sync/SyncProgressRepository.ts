import { Kysely, sql } from 'kysely';
import { BaseCrudRepositoryImpl } from '../BaseCrudRepository.js';
import type { SyncProgressRepository } from './types.js';
import type {
  SyncProgress,
  CreateSyncProgressData,
  UpdateSyncProgressData,
} from '../../types/sync.js';
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

    // PostgreSQL UPSERT using ON CONFLICT
    const row = await this.db
      .insertInto('sync_progress')
      .values(insertData)
      .onConflict((oc) =>
        oc.columns(['tenant_id', 'channel_id']).doUpdateSet({
          last_synced_message_id: insertData.last_synced_message_id,
          last_synced_at: insertData.last_synced_at,
          status: insertData.status,
          error_details: insertData.error_details,
          updated_at: new Date().toISOString(),
        })
      )
      .returningAll()
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
    const row = await this.db
      .updateTable('sync_progress')
      .set({
        status: 'failed' as SyncStatus,
        error_details: JSON.stringify(errorDetails),
        updated_at: new Date().toISOString(),
      })
      .where('channel_id', '=', channelId)
      .returningAll()
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
    const row = await this.db
      .updateTable('sync_progress')
      .set({
        last_synced_message_id: lastSyncedMessageId,
        last_synced_at: lastSyncedAt.toISOString(),
        status: 'completed' as SyncStatus,
        error_details: null,
        updated_at: new Date().toISOString(),
      })
      .where('channel_id', '=', channelId)
      .returningAll()
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
    };
  }

  /**
   * Map create data to database row format
   */
  protected mapCreateDataToRow(data: CreateSyncProgressData): any {
    return {
      id: sql`gen_random_uuid()`,
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
