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
import { decodeMessageId } from '../../../utils/base62.js';

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
      meta: {},
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
      meta: {},
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
      meta: {},
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
      meta: {},
    });
  })
);

/**
 * GET /api/v1/channels/by-slug/:slug/messages
 * Get messages for a channel using slug (convenience endpoint)
 */
router.get(
  '/channels/by-slug/:slug/messages',
  validateTenantHeader,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantSlug = (req as any).tenantSlug;
    const { slug } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    // First resolve the slug to a channel
    const channelResult = await contentService.getChannelBySlug(tenantSlug, slug);
    
    if (!channelResult.success) {
      if (channelResult.error.type === 'NOT_FOUND') {
        throw new ApiError(404, 'Channel Not Found', channelResult.error.message);
      }
      throw new ApiError(500, 'Internal Server Error', channelResult.error.message);
    }

    // Then get the messages
    const result = await contentService.getChannelMessages(
      tenantSlug,
      channelResult.data.id,
      { page, limit }
    );

    if (!result.success) {
      throw new ApiError(500, 'Internal Server Error', result.error.message);
    }

    const { data: items, pagination: paginationMeta } = result.data;

    res.json({
      data: items,
      meta: paginationMeta,
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
      meta: paginationMeta,
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
      meta: paginationMeta,
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
      meta: paginationMeta,
    });
  })
);

/**
 * GET /api/v1/channels/by-slug/:slug
 * Get channel information by slug
 */
router.get(
  '/channels/by-slug/:slug',
  validateTenantHeader,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantSlug = (req as any).tenantSlug;
    const { slug } = req.params;

    const result = await contentService.getChannelBySlug(tenantSlug, slug);

    if (!result.success) {
      if (result.error.type === 'NOT_FOUND') {
        throw new ApiError(404, 'Channel Not Found', result.error.message);
      }
      throw new ApiError(500, 'Internal Server Error', result.error.message);
    }

    res.json({
      data: result.data,
      meta: {},
    });
  })
);

/**
 * GET /api/v1/messages/:messageId
 * Get a message with surrounding context
 */
router.get(
  '/messages/:messageId',
  validateTenantHeader,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantSlug = (req as any).tenantSlug;
    const { messageId } = req.params;
    const beforeCount = parseInt(req.query.before as string) || undefined;
    const afterCount = parseInt(req.query.after as string) || undefined;

    // Decode the base62-encoded message ID to get the Discord message ID
    let platformMessageId: string;
    try {
      platformMessageId = decodeMessageId(messageId);
    } catch {
      throw new ApiError(400, 'Invalid Message ID', 'Invalid base62-encoded message ID');
    }

    const result = await contentService.getMessageContext(
      tenantSlug,
      platformMessageId,
      { beforeCount, afterCount }
    );

    if (!result.success) {
      if (result.error.type === 'NOT_FOUND') {
        throw new ApiError(404, 'Message Not Found', result.error.message);
      }
      throw new ApiError(500, 'Internal Server Error', result.error.message);
    }

    res.json({
      data: result.data,
      meta: {},
    });
  })
);

/**
 * GET /api/v1/channels/:channelId/messages/at/:timestamp
 * Get messages around a specific timestamp
 */
router.get(
  '/channels/:channelId/messages/at/:timestamp',
  validateTenantHeader,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantSlug = (req as any).tenantSlug;
    const { channelId, timestamp } = req.params;
    const beforeCount = parseInt(req.query.before as string) || undefined;
    const afterCount = parseInt(req.query.after as string) || undefined;

    // Parse timestamp - could be ISO string or Unix timestamp
    let targetDate: Date;
    if (/^\d+$/.test(timestamp)) {
      // Unix timestamp
      targetDate = new Date(parseInt(timestamp) * 1000);
    } else {
      // ISO string
      targetDate = new Date(timestamp);
    }

    if (isNaN(targetDate.getTime())) {
      throw new ApiError(400, 'Invalid Timestamp', 'Timestamp must be a valid Unix timestamp or ISO date string');
    }

    const result = await contentService.getMessagesAtTimestamp(
      tenantSlug,
      channelId,
      targetDate,
      { beforeCount, afterCount }
    );

    if (!result.success) {
      if (result.error.type === 'NOT_FOUND') {
        throw new ApiError(404, 'Channel Not Found', result.error.message);
      }
      throw new ApiError(500, 'Internal Server Error', result.error.message);
    }

    res.json({
      data: result.data,
      meta: {},
    });
  })
);

export default router;
