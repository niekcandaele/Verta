/**
 * Abstract base CRUD service implementation
 */

import type {
  BaseCrudRepository,
  PaginationOptions,
} from '../repositories/types.js';
import type {
  BaseCrudService,
  ServiceResult,
  ServiceErrorType,
} from './types.js';
import {
  createServiceError,
  createSuccessResult,
  createErrorResult,
} from './types.js';

/**
 * Abstract base implementation for CRUD services
 * Provides common functionality and error handling
 */
export abstract class BaseCrudServiceImpl<T, CreateData, UpdateData>
  implements BaseCrudService<T, CreateData, UpdateData>
{
  constructor(
    protected readonly repository: BaseCrudRepository<T, CreateData, UpdateData>
  ) {}

  /**
   * Find all entities with optional pagination
   */
  async findAll(pagination?: PaginationOptions): Promise<ServiceResult<any>> {
    try {
      const result = await this.repository.findAll(pagination);
      return createSuccessResult(result);
    } catch (error) {
      return this.handleRepositoryError(error);
    }
  }

  /**
   * Find entity by ID
   */
  async findById(id: string): Promise<ServiceResult<T>> {
    try {
      const entity = await this.repository.findById(id);
      if (!entity) {
        return createErrorResult(
          createServiceError(
            'NOT_FOUND' as ServiceErrorType,
            `Entity with ID ${id} not found`
          )
        );
      }
      return createSuccessResult(entity);
    } catch (error) {
      return this.handleRepositoryError(error);
    }
  }

  /**
   * Create a new entity
   */
  async create(data: CreateData): Promise<ServiceResult<T>> {
    try {
      const entity = await this.repository.create(data);
      return createSuccessResult(entity);
    } catch (error) {
      return this.handleRepositoryError(error);
    }
  }

  /**
   * Update an existing entity
   */
  async update(id: string, data: UpdateData): Promise<ServiceResult<T>> {
    try {
      const updated = await this.repository.update(id, data);
      if (!updated) {
        return createErrorResult(
          createServiceError(
            'NOT_FOUND' as ServiceErrorType,
            `Entity with ID ${id} not found`
          )
        );
      }
      return createSuccessResult(updated);
    } catch (error) {
      return this.handleRepositoryError(error);
    }
  }

  /**
   * Delete an entity
   */
  async delete(id: string): Promise<ServiceResult<boolean>> {
    try {
      const deleted = await this.repository.delete(id);
      if (!deleted) {
        return createErrorResult(
          createServiceError(
            'NOT_FOUND' as ServiceErrorType,
            `Entity with ID ${id} not found`
          )
        );
      }
      return createSuccessResult(true);
    } catch (error) {
      return this.handleRepositoryError(error);
    }
  }

  /**
   * Handle repository errors and convert to service errors
   */
  protected handleRepositoryError(error: unknown): ServiceResult<any> {
    // Check for database constraint violations
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      // PostgreSQL unique constraint violation
      if (
        message.includes('duplicate key') ||
        message.includes('unique constraint')
      ) {
        return createErrorResult(
          createServiceError(
            'DUPLICATE_ENTRY' as ServiceErrorType,
            'A record with this value already exists',
            error.message
          )
        );
      }

      // PostgreSQL foreign key violation
      if (message.includes('foreign key')) {
        return createErrorResult(
          createServiceError(
            'BUSINESS_RULE_VIOLATION' as ServiceErrorType,
            'Operation violates referential integrity',
            error.message
          )
        );
      }

      // Generic database error
      if (message.includes('database') || message.includes('connection')) {
        return createErrorResult(
          createServiceError(
            'DATABASE_ERROR' as ServiceErrorType,
            'Database operation failed',
            error.message
          )
        );
      }
    }

    // Default to internal error
    return createErrorResult(
      createServiceError(
        'INTERNAL_ERROR' as ServiceErrorType,
        'An unexpected error occurred',
        error
      )
    );
  }
}
