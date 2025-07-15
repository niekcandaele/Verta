import type {
  ColumnType,
  Generated,
  Selectable,
  Insertable,
  Updateable,
} from 'kysely';

/**
 * Database table types for multi-tenant system
 */

// Tenant status enum matching PostgreSQL enum type
export type TenantStatus = 'ACTIVE' | 'CANCELLED' | 'MAINTENANCE';

// Platform enum matching PostgreSQL enum type
export type Platform = 'slack' | 'discord';

/**
 * Database table schema for tenants
 */
export interface TenantsTable {
  // UUID primary key with default generation
  id: Generated<string>;

  // Tenant display name
  name: string;

  // URL-friendly unique identifier
  slug: string;

  // Tenant status
  status: TenantStatus;

  // Integration platform
  platform: Platform;

  // Platform-specific identifier (e.g., Slack workspace ID, Discord guild ID)
  platform_id: string;

  // Timestamps with automatic management
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

/**
 * Database schema interface
 */
export interface Database {
  tenants: TenantsTable;
}

/**
 * Type helpers for working with tenant records
 */
export type Tenant = Selectable<TenantsTable>;
export type NewTenant = Insertable<TenantsTable>;
export type TenantUpdate = Updateable<TenantsTable>;
