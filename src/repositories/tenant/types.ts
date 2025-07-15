/**
 * Domain types for tenant repository
 */

import type { TenantStatus, Platform } from '../../database/types.js';

/**
 * Tenant entity with camelCase properties for domain layer
 */
export interface Tenant {
  /** UUID primary key */
  id: string;
  /** Tenant display name */
  name: string;
  /** URL-friendly unique identifier */
  slug: string;
  /** Current tenant status */
  status: TenantStatus;
  /** Integration platform */
  platform: Platform;
  /** Platform-specific identifier */
  platformId: string;
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * Data required to create a new tenant
 * ID and timestamps are auto-generated
 */
export interface CreateTenantData {
  /** Tenant display name */
  name: string;
  /** URL-friendly unique identifier */
  slug: string;
  /** Integration platform */
  platform: Platform;
  /** Platform-specific identifier */
  platformId: string;
  /** Tenant status (defaults to ACTIVE if not provided) */
  status?: TenantStatus;
}

/**
 * Data for updating an existing tenant
 * All fields are optional for partial updates
 */
export interface UpdateTenantData {
  /** Tenant display name */
  name?: string;
  /** URL-friendly unique identifier */
  slug?: string;
  /** Current tenant status */
  status?: TenantStatus;
  /** Integration platform */
  platform?: Platform;
  /** Platform-specific identifier */
  platformId?: string;
}
