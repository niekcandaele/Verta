/**
 * Tenant branding repository implementation
 */

import { Kysely, sql } from 'kysely';
import { BaseCrudRepositoryImpl } from '../BaseCrudRepository.js';
import type { TenantBrandingRepository } from './TenantBrandingRepository.js';
import type {
  TenantBranding,
  CreateTenantBrandingData,
  UpdateTenantBrandingData,
} from 'shared-types';
import type { Database } from '../../database/types.js';

/**
 * Concrete implementation of TenantBrandingRepository using Kysely
 */
export class TenantBrandingRepositoryImpl
  extends BaseCrudRepositoryImpl<
    TenantBranding,
    CreateTenantBrandingData,
    UpdateTenantBrandingData
  >
  implements TenantBrandingRepository
{
  constructor(db: Kysely<Database>) {
    super(db, 'tenant_branding');
  }

  /**
   * Find tenant branding by tenant ID
   */
  async findByTenantId(tenantId: string): Promise<TenantBranding | null> {
    const row = await this.db
      .selectFrom('tenant_branding')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();

    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Create or update tenant branding (upsert)
   */
  async upsert(data: CreateTenantBrandingData): Promise<TenantBranding> {
    const row = await this.db
      .insertInto('tenant_branding')
      .values(this.mapCreateDataToRow(data))
      .onConflict((oc) =>
        oc.column('tenant_id').doUpdateSet(this.mapUpdateDataToRow(data))
      )
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRowToEntity(row);
  }

  /**
   * Map database row to domain entity
   * Converts snake_case to camelCase
   */
  protected mapRowToEntity(row: any): TenantBranding {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      logo: row.logo,
      primaryColor: row.primary_color,
      secondaryColor: row.secondary_color,
      accentColor: row.accent_color,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Map create data to database row format
   * Converts camelCase to snake_case
   */
  protected mapCreateDataToRow(data: CreateTenantBrandingData): any {
    return {
      id: sql`gen_random_uuid()`,
      tenant_id: data.tenantId,
      logo: data.logo || null,
      primary_color: data.primaryColor || '#3b82f6',
      secondary_color: data.secondaryColor || '#64748b',
      accent_color: data.accentColor || '#10b981',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Map update data to database row format
   * Converts camelCase to snake_case
   */
  protected mapUpdateDataToRow(data: UpdateTenantBrandingData): any {
    const row: any = {};

    if (data.logo !== undefined) row.logo = data.logo;
    if (data.primaryColor !== undefined) row.primary_color = data.primaryColor;
    if (data.secondaryColor !== undefined)
      row.secondary_color = data.secondaryColor;
    if (data.accentColor !== undefined) row.accent_color = data.accentColor;

    return row;
  }
}
