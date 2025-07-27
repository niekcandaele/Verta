import { Kysely, sql } from 'kysely';
import { BaseCrudRepositoryImpl } from '../BaseCrudRepository.js';
import type { ChannelRepository } from './types.js';
import type {
  Channel,
  CreateChannelData,
  UpdateChannelData,
} from 'shared-types';
import type { Database, ChannelType } from '../../database/types.js';

/**
 * Implementation of ChannelRepository using Kysely
 */
export class ChannelRepositoryImpl
  extends BaseCrudRepositoryImpl<Channel, CreateChannelData, UpdateChannelData>
  implements ChannelRepository
{
  constructor(db: Kysely<Database>) {
    super(db, 'channels');
  }

  /**
   * Find a channel by platform channel ID and tenant ID
   */
  async findByPlatformId(
    tenantId: string,
    platformChannelId: string
  ): Promise<Channel | null> {
    const row = await this.db
      .selectFrom('channels')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('platform_channel_id', '=', platformChannelId)
      .executeTakeFirst();

    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Find all channels for a tenant
   */
  async findByTenant(tenantId: string): Promise<Channel[]> {
    const rows = await this.db
      .selectFrom('channels')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .orderBy('created_at', 'asc')
      .execute();

    return rows.map((row) => this.mapRowToEntity(row));
  }

  /**
   * Find all channels for a tenant (alias for findByTenant)
   */
  async findByTenantId(tenantId: string): Promise<Channel[]> {
    return this.findByTenant(tenantId);
  }

  /**
   * Find child channels of a parent channel
   */
  async findByParentId(parentChannelId: string): Promise<Channel[]> {
    const rows = await this.db
      .selectFrom('channels')
      .selectAll()
      .where('parent_channel_id', '=', parentChannelId)
      .orderBy('name', 'asc')
      .execute();

    return rows.map((row) => this.mapRowToEntity(row));
  }

  /**
   * Upsert a channel (create if not exists, update if exists)
   */
  async upsert(data: CreateChannelData): Promise<Channel> {
    const insertData = this.mapCreateDataToRow(data);

    // PostgreSQL UPSERT using ON CONFLICT
    const row = await this.db
      .insertInto('channels')
      .values(insertData)
      .onConflict((oc) =>
        oc.columns(['tenant_id', 'platform_channel_id']).doUpdateSet({
          name: insertData.name,
          type: insertData.type,
          parent_channel_id: insertData.parent_channel_id,
          metadata: insertData.metadata,
          updated_at: new Date().toISOString(),
        })
      )
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRowToEntity(row);
  }

  /**
   * Map database row to domain entity
   */
  protected mapRowToEntity(row: any): Channel {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      platformChannelId: row.platform_channel_id,
      name: row.name,
      type: row.type as ChannelType,
      parentChannelId: row.parent_channel_id,
      metadata: row.metadata || {},
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Map create data to database row format
   */
  protected mapCreateDataToRow(data: CreateChannelData): any {
    return {
      id: sql`gen_random_uuid()`,
      tenant_id: data.tenantId,
      platform_channel_id: data.platformChannelId,
      name: data.name,
      type: data.type,
      parent_channel_id: data.parentChannelId || null,
      metadata: JSON.stringify(data.metadata || {}),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Map update data to database row format
   */
  protected mapUpdateDataToRow(data: UpdateChannelData): any {
    const row: any = {};

    if (data.name !== undefined) row.name = data.name;
    if (data.type !== undefined) row.type = data.type;
    if (data.parentChannelId !== undefined) {
      row.parent_channel_id = data.parentChannelId;
    }
    if (data.metadata !== undefined) {
      row.metadata = JSON.stringify(data.metadata);
    }

    return row;
  }
}
