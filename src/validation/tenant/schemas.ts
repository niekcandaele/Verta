/**
 * Zod validation schemas for tenant operations
 */

import { z } from 'zod';

/**
 * Validation schema for tenant slug
 * - Must contain only lowercase letters, numbers, and hyphens
 * - Must be between 3 and 50 characters
 * - Cannot start or end with a hyphen
 */
const SlugSchema = z
  .string()
  .min(3, 'Slug must be at least 3 characters long')
  .max(50, 'Slug must not exceed 50 characters')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Slug must contain only lowercase letters, numbers, and hyphens (cannot start or end with hyphen)'
  );

/**
 * Validation schema for tenant name
 * - Required, non-empty string
 * - Maximum 255 characters
 */
const NameSchema = z
  .string()
  .min(1, 'Name is required')
  .max(255, 'Name must not exceed 255 characters')
  .trim();

/**
 * Validation schema for platform
 * Must be either 'slack' or 'discord'
 */
const PlatformSchema = z.enum(['slack', 'discord'] as const);

/**
 * Validation schema for tenant status
 * Must be one of: ACTIVE, CANCELLED, MAINTENANCE
 */
const StatusSchema = z.enum(['ACTIVE', 'CANCELLED', 'MAINTENANCE'] as const);

/**
 * Validation schema for platform ID
 * - Required, non-empty string
 * - Maximum 255 characters
 * - Additional validation could be added for specific platform formats
 */
const PlatformIdSchema = z
  .string()
  .min(1, 'Platform ID is required')
  .max(255, 'Platform ID must not exceed 255 characters')
  .trim();

/**
 * Schema for creating a new tenant
 * All fields except status are required
 * Status defaults to 'ACTIVE' if not provided
 */
export const CreateTenantSchema = z.object({
  name: NameSchema,
  slug: SlugSchema,
  platform: PlatformSchema,
  platformId: PlatformIdSchema,
  status: StatusSchema.optional().default('ACTIVE'),
});

/**
 * Schema for updating an existing tenant
 * All fields are optional for partial updates
 */
export const UpdateTenantSchema = z.object({
  name: NameSchema.optional(),
  slug: SlugSchema.optional(),
  platform: PlatformSchema.optional(),
  platformId: PlatformIdSchema.optional(),
  status: StatusSchema.optional(),
});

/**
 * Type inference for create tenant data
 */
export type CreateTenantInput = z.input<typeof CreateTenantSchema>;

/**
 * Type inference for update tenant data
 */
export type UpdateTenantInput = z.infer<typeof UpdateTenantSchema>;

/**
 * Validate create tenant input
 * @param data - Raw input data
 * @returns Validated and transformed data
 * @throws ZodError if validation fails
 */
export function validateCreateTenant(data: unknown): CreateTenantInput {
  return CreateTenantSchema.parse(data);
}

/**
 * Validate update tenant input
 * @param data - Raw input data
 * @returns Validated and transformed data
 * @throws ZodError if validation fails
 */
export function validateUpdateTenant(data: unknown): UpdateTenantInput {
  return UpdateTenantSchema.parse(data);
}

/**
 * Safe validation for create tenant (returns result instead of throwing)
 * @param data - Raw input data
 * @returns Validation result with success flag and data or error
 */
export function safeValidateCreateTenant(data: unknown) {
  return CreateTenantSchema.safeParse(data);
}

/**
 * Safe validation for update tenant (returns result instead of throwing)
 * @param data - Raw input data
 * @returns Validation result with success flag and data or error
 */
export function safeValidateUpdateTenant(data: unknown) {
  return UpdateTenantSchema.safeParse(data);
}