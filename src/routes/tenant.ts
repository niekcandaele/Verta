/**
 * Tenant API routes
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { validateApiKey, asyncHandler, ApiError } from '../middleware/index.js';
import { TenantServiceImpl } from '../services/tenant/index.js';
import { TenantRepositoryImpl } from '../repositories/tenant/index.js';
import {
  CreateTenantSchema,
  UpdateTenantSchema,
} from '../validation/tenant/index.js';
import { ServiceErrorType } from '../services/types.js';
import { db } from '../database/index.js';
import type { Kysely } from 'kysely';
import type { Database } from '../database/types.js';

/**
 * Create tenant router with dependencies
 * @param database - Optional database instance (defaults to main db)
 * @returns Express router for tenant endpoints
 */
export function createTenantRouter(database?: Kysely<Database>): Router {
  // Initialize dependencies
  const dbInstance = database || db;
  const tenantRepository = new TenantRepositoryImpl(dbInstance);
  const tenantService = new TenantServiceImpl(tenantRepository);

  const router = Router();

  // Apply authentication middleware to all tenant routes
  router.use(validateApiKey);

  /**
   * GET /api/tenants
   * List all tenants with pagination
   */
  router.get(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      // Parse and validate query parameters
      const querySchema = z.object({
        page: z.coerce.number().int().positive().optional().default(1),
        limit: z.coerce
          .number()
          .int()
          .positive()
          .max(100)
          .optional()
          .default(10),
        sortBy: z
          .enum(['created_at', 'updated_at', 'name'])
          .optional()
          .default('created_at'),
        sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
      });

      const query = querySchema.parse(req.query);

      // Get tenants from service
      const result = await tenantService.findAll({
        page: query.page,
        limit: query.limit,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      });

      if (!result.success) {
        throw new ApiError(
          500,
          'Internal Server Error',
          result.error.message,
          result.error.details
        );
      }

      res.json(result.data);
    })
  );

  /**
   * GET /api/tenants/:id
   * Get a specific tenant by ID
   */
  router.get(
    '/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;

      // Validate UUID format
      const uuidSchema = z.string().uuid('Invalid tenant ID format');
      const validatedId = uuidSchema.parse(id);

      // Get tenant from service
      const result = await tenantService.findById(validatedId);

      if (!result.success) {
        if (result.error.type === ServiceErrorType.NOT_FOUND) {
          throw new ApiError(404, 'Not Found', result.error.message);
        }
        throw new ApiError(
          500,
          'Internal Server Error',
          result.error.message,
          result.error.details
        );
      }

      res.json(result.data);
    })
  );

  /**
   * POST /api/tenants
   * Create a new tenant
   */
  router.post(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      // Validate request body - use safeParse to allow service to handle slug generation
      const parseResult = CreateTenantSchema.safeParse(req.body);

      // If slug is missing but everything else is valid, let the service handle it
      if (!parseResult.success) {
        const slugError = parseResult.error.issues.find(
          (issue) => issue.path[0] === 'slug'
        );
        const otherErrors = parseResult.error.issues.filter(
          (issue) => issue.path[0] !== 'slug'
        );

        // If only slug is missing and it's a required field error, pass through for service to generate
        if (slugError && otherErrors.length === 0 && req.body.name) {
          // Pass the data to service which will generate the slug
        } else {
          // Re-throw the validation error for other issues
          throw parseResult.error;
        }
      }

      const dataToCreate = req.body;

      // Create tenant through service
      const result = await tenantService.create(dataToCreate);

      if (!result.success) {
        if (result.error.type === ServiceErrorType.VALIDATION_ERROR) {
          throw new ApiError(
            400,
            'Validation Error',
            result.error.message,
            result.error.details
          );
        }
        if (result.error.type === ServiceErrorType.DUPLICATE_ENTRY) {
          throw new ApiError(
            409,
            'Duplicate Entry',
            result.error.message,
            result.error.details
          );
        }
        throw new ApiError(
          500,
          'Internal Server Error',
          result.error.message,
          result.error.details
        );
      }

      res.status(201).json(result.data);
    })
  );

  /**
   * PATCH /api/tenants/:id
   * Update an existing tenant
   */
  router.patch(
    '/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;

      // Validate UUID format
      const uuidSchema = z.string().uuid('Invalid tenant ID format');
      const validatedId = uuidSchema.parse(id);

      // Validate request body
      const validatedData = UpdateTenantSchema.parse(req.body);

      // Check if body is empty
      if (Object.keys(validatedData).length === 0) {
        throw new ApiError(
          400,
          'Bad Request',
          'No valid fields provided for update'
        );
      }

      // Update tenant through service
      const result = await tenantService.update(validatedId, validatedData);

      if (!result.success) {
        if (result.error.type === ServiceErrorType.NOT_FOUND) {
          throw new ApiError(404, 'Not Found', result.error.message);
        }
        if (result.error.type === ServiceErrorType.VALIDATION_ERROR) {
          throw new ApiError(
            400,
            'Validation Error',
            result.error.message,
            result.error.details
          );
        }
        if (result.error.type === ServiceErrorType.DUPLICATE_ENTRY) {
          throw new ApiError(
            409,
            'Duplicate Entry',
            result.error.message,
            result.error.details
          );
        }
        throw new ApiError(
          500,
          'Internal Server Error',
          result.error.message,
          result.error.details
        );
      }

      res.json(result.data);
    })
  );

  /**
   * DELETE /api/tenants/:id
   * Delete a tenant
   */
  router.delete(
    '/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;

      // Validate UUID format
      const uuidSchema = z.string().uuid('Invalid tenant ID format');
      const validatedId = uuidSchema.parse(id);

      // Delete tenant through service
      const result = await tenantService.delete(validatedId);

      if (!result.success) {
        if (result.error.type === ServiceErrorType.NOT_FOUND) {
          throw new ApiError(404, 'Not Found', result.error.message);
        }
        throw new ApiError(
          500,
          'Internal Server Error',
          result.error.message,
          result.error.details
        );
      }

      res.status(204).send();
    })
  );

  return router;
}

// Export default router for backward compatibility
export const tenantRouter = createTenantRouter();
