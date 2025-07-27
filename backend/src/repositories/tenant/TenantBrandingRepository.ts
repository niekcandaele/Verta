import type { BaseCrudRepository } from '../types.js';
import type {
  TenantBranding,
  CreateTenantBrandingData,
  UpdateTenantBrandingData,
} from 'shared-types';

/**
 * Repository interface for tenant branding operations
 */
export interface TenantBrandingRepository
  extends BaseCrudRepository<
    TenantBranding,
    CreateTenantBrandingData,
    UpdateTenantBrandingData
  > {
  /**
   * Find tenant branding by tenant ID
   * @param tenantId - The tenant ID
   * @returns The tenant branding or null if not found
   */
  findByTenantId(tenantId: string): Promise<TenantBranding | null>;

  /**
   * Create or update tenant branding (upsert)
   * @param data - The branding data
   * @returns The created or updated tenant branding
   */
  upsert(data: CreateTenantBrandingData): Promise<TenantBranding>;
}
