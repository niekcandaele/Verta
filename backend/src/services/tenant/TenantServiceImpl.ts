/**
 * Tenant service implementation
 */

import { z } from 'zod';
import { BaseCrudServiceImpl } from '../BaseCrudService.js';
import type { TenantService } from './TenantService.js';
import type { TenantRepository } from '../../repositories/tenant/TenantRepository.js';
import type { Tenant } from '../../repositories/tenant/types.js';
import type {
  CreateTenantInput,
  UpdateTenantInput,
} from '../../validation/tenant/index.js';
import type { ServiceResult } from '../types.js';
import {
  ServiceErrorType,
  createServiceError,
  createSuccessResult,
  createErrorResult,
} from '../types.js';
import {
  CreateTenantSchema,
  UpdateTenantSchema,
} from '../../validation/tenant/index.js';
import { SyncServiceImpl } from '../sync/index.js';
import logger from '../../utils/logger.js';

/**
 * Concrete implementation of TenantService
 * Handles business logic, validation, and slug generation
 */
export class TenantServiceImpl
  extends BaseCrudServiceImpl<Tenant, CreateTenantInput, UpdateTenantInput>
  implements TenantService
{
  private syncService: SyncServiceImpl;

  constructor(private readonly tenantRepository: TenantRepository) {
    super(tenantRepository);
    this.syncService = new SyncServiceImpl();
  }

  /**
   * Find a tenant by its unique slug
   */
  async findBySlug(slug: string): Promise<ServiceResult<Tenant>> {
    try {
      const tenant = await this.tenantRepository.findBySlug(slug);
      if (!tenant) {
        return createErrorResult(
          createServiceError(
            ServiceErrorType.NOT_FOUND,
            `Tenant with slug '${slug}' not found`
          )
        );
      }
      return createSuccessResult(tenant);
    } catch (error) {
      return this.handleRepositoryError(error);
    }
  }

  /**
   * Find a tenant by platform and platform-specific ID
   */
  async findByPlatformId(
    platform: 'slack' | 'discord',
    platformId: string
  ): Promise<ServiceResult<Tenant>> {
    try {
      const tenant = await this.tenantRepository.findByPlatformId(
        platform,
        platformId
      );
      if (!tenant) {
        return createErrorResult(
          createServiceError(
            ServiceErrorType.NOT_FOUND,
            `Tenant for platform '${platform}' with ID '${platformId}' not found`
          )
        );
      }
      return createSuccessResult(tenant);
    } catch (error) {
      return this.handleRepositoryError(error);
    }
  }

  /**
   * Override create to handle slug generation and trigger initial sync
   */
  async create(data: CreateTenantInput): Promise<ServiceResult<Tenant>> {
    try {
      // First handle slug generation before validation
      const dataWithSlug = {
        ...data,
        slug: data.slug || this.generateSlug(data.name),
      };

      // Validate input with Zod
      const validatedData = CreateTenantSchema.parse(dataWithSlug);

      // Use parent create method which will call our validation hooks
      const result = await super.create(validatedData);

      // If creation was successful and it's a Discord tenant, trigger initial sync
      if (result.success && result.data.platform === 'discord') {
        try {
          const syncResult = await this.syncService.startSync(result.data.id, {
            syncType: 'full', // Initial sync should be full
          });

          if (syncResult.success) {
            logger.info('Initial sync triggered for new Discord tenant', {
              tenantId: result.data.id,
              jobId: syncResult.data.jobId,
            });
          } else {
            // Log sync failure but don't fail tenant creation
            logger.error('Failed to trigger initial sync for Discord tenant', {
              tenantId: result.data.id,
              error: syncResult.error,
            });
          }
        } catch (syncError) {
          // Log error but don't fail tenant creation
          logger.error('Error triggering initial sync for Discord tenant', {
            tenantId: result.data.id,
            error: syncError,
          });
        }
      }

      return result;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return createErrorResult(
          createServiceError(
            ServiceErrorType.VALIDATION_ERROR,
            this.formatZodError(error)
          )
        );
      }
      return this.handleRepositoryError(error);
    }
  }

  /**
   * Override update to validate with Zod
   */
  async update(
    id: string,
    data: UpdateTenantInput
  ): Promise<ServiceResult<Tenant>> {
    try {
      // Validate input with Zod
      const validatedData = UpdateTenantSchema.parse(data);

      // Use parent update method which will call our validation hooks
      return super.update(id, validatedData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return createErrorResult(
          createServiceError(
            ServiceErrorType.VALIDATION_ERROR,
            this.formatZodError(error)
          )
        );
      }
      return this.handleRepositoryError(error);
    }
  }

  /**
   * Generate a slug from a given name
   */
  generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
      .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .substring(0, 50); // Limit length to 50 chars
  }

  /**
   * Override error handling to provide better messages for constraint violations
   */
  protected handleRepositoryError(error: unknown): ServiceResult<any> {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      
      // MySQL/TiDB duplicate key error
      const mysqlError = error as any;
      if (mysqlError.code === 'ER_DUP_ENTRY') {
        // Parse the duplicate key message to determine which constraint failed
        if (message.includes('idx_tenants_slug') || message.includes("'slug'")) {
          return createErrorResult(
            createServiceError(
              ServiceErrorType.DUPLICATE_ENTRY,
              'A tenant with this slug already exists'
            )
          );
        }
        if (message.includes('idx_tenants_platform_platform_id') || 
            (message.includes("'platform'") && message.includes("'platform_id'"))) {
          return createErrorResult(
            createServiceError(
              ServiceErrorType.DUPLICATE_ENTRY,
              'A tenant for this platform already exists'
            )
          );
        }
        // Generic duplicate entry error
        return createErrorResult(
          createServiceError(
            ServiceErrorType.DUPLICATE_ENTRY,
            'A duplicate entry already exists'
          )
        );
      }

      // PostgreSQL unique constraint violations (keeping for compatibility)
      if (
        message.includes('duplicate key') ||
        message.includes('unique constraint')
      ) {
        if (message.includes('idx_tenants_slug')) {
          return createErrorResult(
            createServiceError(
              ServiceErrorType.DUPLICATE_ENTRY,
              'A tenant with this slug already exists'
            )
          );
        }
        if (message.includes('idx_tenants_platform_platform_id')) {
          return createErrorResult(
            createServiceError(
              ServiceErrorType.DUPLICATE_ENTRY,
              'A tenant for this platform already exists'
            )
          );
        }
      }
    }

    // Fall back to base error handling
    return super.handleRepositoryError(error);
  }

  /**
   * Format Zod validation errors into a readable message
   */
  private formatZodError(error: z.ZodError): string {
    const issues = error.issues.map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    });
    return issues.join('; ');
  }
}
