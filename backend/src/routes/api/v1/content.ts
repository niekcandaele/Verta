/**
 * Public content API routes (v1)
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../../middleware/errorHandler.js';
import { ApiError } from '../../../middleware/errorHandler.js';
import { apiRateLimiter } from '../../../middleware/rateLimit.js';
import { ContentServiceImpl } from '../../../services/content/index.js';
import { TenantRepositoryImpl } from '../../../repositories/tenant/index.js';
import { TenantBrandingRepositoryImpl } from '../../../repositories/tenant/index.js';
import { ChannelRepository } from '../../../repositories/sync/index.js';
import { MessageRepository } from '../../../repositories/sync/index.js';
import { getDatabase } from '../../../database/index.js';

// Initialize repositories and service (will be done after database is available)
let contentService: ContentServiceImpl;

// Initialize the service with database
async function initializeService() {
  const database = await getDatabase();
  const tenantRepository = new TenantRepositoryImpl(database);
  const brandingRepository = new TenantBrandingRepositoryImpl(database);
  const channelRepository = new ChannelRepository(database);
  const messageRepository = new MessageRepository(database);
  contentService = new ContentServiceImpl(
    tenantRepository,
    brandingRepository,
    channelRepository,
    messageRepository
  );
}

// Call initialization
initializeService().catch(console.error);

/**
 * Middleware to validate and extract tenant slug from header
 */
function validateTenantHeader(req: Request, _res: Response, next: (err?: any) => void) {
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

// Apply rate limiting to all routes
router.use(apiRateLimiter);

/**
 * GET /api/v1/tenant
 * Get tenant information
 */
router.get(
  '/tenant',
  validateTenantHeader,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantSlug = (req as any).tenantSlug;
    
    const result = await contentService.getTenant(tenantSlug);
    
    if (!result.success) {
      if (result.error.type === 'NOT_FOUND') {
        throw new ApiError(404, 'Tenant Not Found', result.error.message);
      }
      throw new ApiError(500, 'Internal Server Error', result.error.message);
    }
    
    res.json({
      data: result.data,
      meta: {}
    });
  })
);

/**
 * GET /api/v1/branding
 * Get tenant branding
 */
router.get(
  '/branding',
  validateTenantHeader,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantSlug = (req as any).tenantSlug;
    
    const result = await contentService.getBranding(tenantSlug);
    
    if (!result.success) {
      if (result.error.type === 'NOT_FOUND') {
        throw new ApiError(404, 'Tenant Not Found', result.error.message);
      }
      throw new ApiError(500, 'Internal Server Error', result.error.message);
    }
    
    res.json({
      data: result.data,
      meta: {}
    });
  })
);

/**
 * GET /api/v1/channels
 * Get all channels for the tenant
 */
router.get(
  '/channels',
  validateTenantHeader,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantSlug = (req as any).tenantSlug;
    
    const result = await contentService.getChannels(tenantSlug);
    
    if (!result.success) {
      if (result.error.type === 'NOT_FOUND') {
        throw new ApiError(404, 'Tenant Not Found', result.error.message);
      }
      throw new ApiError(500, 'Internal Server Error', result.error.message);
    }
    
    res.json({
      data: result.data,
      meta: {}
    });
  })
);

/**
 * GET /api/v1/channels/:channelId
 * Get specific channel information
 */
router.get(
  '/channels/:channelId',
  validateTenantHeader,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantSlug = (req as any).tenantSlug;
    const { channelId } = req.params;
    
    const result = await contentService.getChannel(tenantSlug, channelId);
    
    if (!result.success) {
      if (result.error.type === 'NOT_FOUND') {
        throw new ApiError(404, 'Channel Not Found', result.error.message);
      }
      throw new ApiError(500, 'Internal Server Error', result.error.message);
    }
    
    res.json({
      data: result.data,
      meta: {}
    });
  })
);

/**
 * GET /api/v1/channels/:channelId/messages
 * Get paginated messages for a channel
 */
router.get(
  '/channels/:channelId/messages',
  validateTenantHeader,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantSlug = (req as any).tenantSlug;
    const { channelId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    
    const result = await contentService.getChannelMessages(
      tenantSlug,
      channelId,
      { page, limit }
    );
    
    if (!result.success) {
      if (result.error.type === 'NOT_FOUND') {
        throw new ApiError(404, 'Channel Not Found', result.error.message);
      }
      throw new ApiError(500, 'Internal Server Error', result.error.message);
    }
    
    const { data: items, pagination: paginationMeta } = result.data;
    
    res.json({
      data: items,
      meta: paginationMeta
    });
  })
);

/**
 * GET /api/v1/channels/:channelId/threads
 * Get paginated threads for a forum channel
 */
router.get(
  '/channels/:channelId/threads',
  validateTenantHeader,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantSlug = (req as any).tenantSlug;
    const { channelId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    
    const result = await contentService.getChannelThreads(
      tenantSlug,
      channelId,
      { page, limit }
    );
    
    if (!result.success) {
      if (result.error.type === 'NOT_FOUND') {
        throw new ApiError(404, 'Channel Not Found', result.error.message);
      }
      throw new ApiError(500, 'Internal Server Error', result.error.message);
    }
    
    const { data: items, pagination: paginationMeta } = result.data;
    
    res.json({
      data: items,
      meta: paginationMeta
    });
  })
);

/**
 * GET /api/v1/channels/:channelId/threads/:threadId/messages
 * Get paginated messages for a specific thread
 */
router.get(
  '/channels/:channelId/threads/:threadId/messages',
  validateTenantHeader,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantSlug = (req as any).tenantSlug;
    const { channelId, threadId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    
    const result = await contentService.getThreadMessages(
      tenantSlug,
      channelId,
      threadId,
      { page, limit }
    );
    
    if (!result.success) {
      if (result.error.type === 'NOT_FOUND') {
        throw new ApiError(404, 'Thread Not Found', result.error.message);
      }
      throw new ApiError(500, 'Internal Server Error', result.error.message);
    }
    
    const { data: items, pagination: paginationMeta } = result.data;
    
    res.json({
      data: items,
      meta: paginationMeta
    });
  })
);

export default router;