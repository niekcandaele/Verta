/**
 * Tenant repository implementation
 */

import { Kysely, sql } from 'kysely';
import { BaseCrudRepositoryImpl } from '../BaseCrudRepository.js';
import type { TenantRepository } from './TenantRepository.js';
import type { Tenant, CreateTenantData, UpdateTenantData } from './types.js';
import type { Database, Platform } from '../../database/types.js';

/**
 * Concrete implementation of TenantRepository using Kysely
 */
export class TenantRepositoryImpl
  extends BaseCrudRepositoryImpl<Tenant, CreateTenantData, UpdateTenantData>
  implements TenantRepository
{
  constructor(db: Kysely<Database>) {
    super(db, 'tenants');
  }

  /**
   * Find a tenant by its unique slug
   */
  async findBySlug(slug: string): Promise<Tenant | null> {
    const row = await this.db
      .selectFrom('tenants')
      .selectAll()
      .where('slug', '=', slug)
      .executeTakeFirst();

    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Find a tenant by platform and platform-specific ID
   */
  async findByPlatformId(
    platform: Platform,
    platformId: string
  ): Promise<Tenant | null> {
    const row = await this.db
      .selectFrom('tenants')
      .selectAll()
      .where('platform', '=', platform)
      .where('platform_id', '=', platformId)
      .executeTakeFirst();

    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Map database row to domain entity
   * Converts snake_case to camelCase
   */
  protected mapRowToEntity(row: any): Tenant {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      platform: row.platform,
      platformId: row.platform_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Map create data to database row format
   * Converts camelCase to snake_case
   */
  protected mapCreateDataToRow(data: CreateTenantData): any {
    return {
      id: sql`gen_random_uuid()`,
      name: data.name,
      slug: data.slug,
      status: data.status || 'ACTIVE',
      platform: data.platform,
      platform_id: data.platformId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Map update data to database row format
   * Converts camelCase to snake_case
   * Note: updated_at is handled by base repository
   */
  protected mapUpdateDataToRow(data: UpdateTenantData): any {
    const row: any = {};

    if (data.name !== undefined) row.name = data.name;
    if (data.slug !== undefined) row.slug = data.slug;
    if (data.status !== undefined) row.status = data.status;
    if (data.platform !== undefined) row.platform = data.platform;
    if (data.platformId !== undefined) row.platform_id = data.platformId;

    return row;
  }
}
