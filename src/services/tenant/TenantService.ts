/**
 * Tenant service interface
 */

import type { BaseCrudService, ServiceResult } from '../types.js';
import type { Tenant } from '../../repositories/tenant/types.js';
import type { CreateTenantInput, UpdateTenantInput } from '../../validation/tenant/index.js';

/**
 * Service interface for tenant business logic
 */
export interface TenantService
  extends BaseCrudService<Tenant, CreateTenantInput, UpdateTenantInput> {
  /**
   * Find a tenant by its unique slug
   * @param slug - The URL-friendly identifier
   * @returns Service result with tenant or error
   */
  findBySlug(slug: string): Promise<ServiceResult<Tenant>>;

  /**
   * Find a tenant by platform and platform-specific ID
   * @param platform - The integration platform (slack or discord)
   * @param platformId - The platform-specific identifier
   * @returns Service result with tenant or error
   */
  findByPlatformId(
    platform: 'slack' | 'discord',
    platformId: string
  ): Promise<ServiceResult<Tenant>>;

  /**
   * Generate a slug from a given name
   * @param name - The name to generate slug from
   * @returns Generated slug
   */
  generateSlug(name: string): string;
}