import type { BaseCrudRepository } from '../types.js';
import type { Platform } from '../../database/types.js';
import type { Tenant, CreateTenantData, UpdateTenantData } from 'shared-types';

/**
 * Repository interface for tenant-specific database operations
 */
export interface TenantRepository
  extends BaseCrudRepository<Tenant, CreateTenantData, UpdateTenantData> {
  /**
   * Find a tenant by its unique slug
   * @param slug - The URL-friendly identifier
   * @returns The tenant or null if not found
   */
  findBySlug(slug: string): Promise<Tenant | null>;

  /**
   * Find a tenant by platform and platform-specific ID
   * @param platform - The integration platform (slack or discord)
   * @param platformId - The platform-specific identifier
   * @returns The tenant or null if not found
   */
  findByPlatformId(
    platform: Platform,
    platformId: string
  ): Promise<Tenant | null>;
}
