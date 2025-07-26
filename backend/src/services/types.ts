/**
 * Service layer type definitions
 */

import type {
  PaginationOptions,
  PaginatedResult,
} from '../repositories/types.js';

/**
 * Service operation result type
 */
export type ServiceResult<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: ServiceError;
    };

/**
 * Service error types
 */
export enum ServiceErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',
  DATABASE_ERROR = 'DATABASE_ERROR',
  BUSINESS_RULE_VIOLATION = 'BUSINESS_RULE_VIOLATION',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * Service error interface
 */
export interface ServiceError {
  type: ServiceErrorType;
  message: string;
  code?: string;
  details?: unknown;
}

/**
 * Base CRUD service interface
 */
export interface BaseCrudService<T, CreateData, UpdateData> {
  /**
   * Find all entities with optional pagination
   */
  findAll(
    pagination?: PaginationOptions
  ): Promise<ServiceResult<PaginatedResult<T>>>;

  /**
   * Find entity by ID
   */
  findById(id: string): Promise<ServiceResult<T>>;

  /**
   * Create a new entity
   */
  create(data: CreateData): Promise<ServiceResult<T>>;

  /**
   * Update an existing entity
   */
  update(id: string, data: UpdateData): Promise<ServiceResult<T>>;

  /**
   * Delete an entity
   */
  delete(id: string): Promise<ServiceResult<boolean>>;
}

/**
 * Create a service error helper
 */
export function createServiceError(
  type: ServiceErrorType,
  message: string,
  details?: unknown
): ServiceError {
  return { type, message, details };
}

/**
 * Create a success result helper
 */
export function createSuccessResult<T>(data: T): ServiceResult<T> {
  return { success: true, data };
}

/**
 * Create an error result helper
 */
export function createErrorResult<T>(error: ServiceError): ServiceResult<T> {
  return { success: false, error };
}
