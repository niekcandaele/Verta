import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../../middleware/errorHandler.js';
import { ApiError } from '../../../middleware/errorHandler.js';
import { strictRateLimiter } from '../../../middleware/rateLimit.js';
import { SearchService } from '../../../services/SearchService.js';
import { MlClientService } from '../../../services/MlClientService.js';
import { SearchApiRequest } from 'shared-types';
import logger from '../../../utils/logger.js';

// Initialize ML client and search service
const mlClient = new MlClientService({
  baseUrl: process.env.ML_SERVICE_URL || 'http://ml-service:8000',
  apiKey:
    process.env.ML_SERVICE_API_KEY ||
    process.env.ADMIN_API_KEY ||
    'ml-service-key',
});

const searchService = new SearchService(mlClient);

/**
 * Middleware to validate and extract tenant slug from header
 */
function validateTenantHeader(
  req: Request,
  _res: Response,
  next: (err?: any) => void
) {
  const tenantSlug = req.headers['x-tenant-slug'] as string;

  if (!tenantSlug) {
    throw new ApiError(
      400,
      'Missing Tenant Header',
      'The X-Tenant-Slug header is required for all API requests'
    );
  }

  // Attach to request for use in handlers
  (req as any).tenantSlug = tenantSlug;
  next();
}

const router = Router();

/**
 * POST /api/v1/search
 * Execute hybrid search across golden answers and messages
 */
router.post(
  '/',
  strictRateLimiter, // 100 requests per minute rate limit
  validateTenantHeader,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantSlug = (req as any).tenantSlug;

    // Validate request body
    const { query, limit, rerank } = req.body as SearchApiRequest;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new ApiError(
        400,
        'Invalid Request',
        'Query parameter is required and must be a non-empty string'
      );
    }

    if (
      limit !== undefined &&
      (!Number.isInteger(limit) || limit < 1 || limit > 100)
    ) {
      throw new ApiError(
        400,
        'Invalid Request',
        'Limit must be an integer between 1 and 100'
      );
    }

    const searchRequest: SearchApiRequest = {
      query: query.trim(),
      limit: limit || 10,
      rerank: rerank !== undefined ? rerank : true, // Default to true for backward compatibility
    };

    logger.info('Processing search request', {
      tenant: tenantSlug,
      query: searchRequest.query,
      limit: searchRequest.limit,
    });

    try {
      const results = await searchService.search(tenantSlug, searchRequest);

      res.json({
        data: results,
        meta: {
          query: searchRequest.query,
          limit: searchRequest.limit,
        },
      });
    } catch (error) {
      // Let error handler middleware deal with it
      throw error;
    }
  })
);

export default router;
