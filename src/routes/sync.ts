/**
 * Sync routes for platform data synchronization
 */

import { Router } from 'express';
import { z } from 'zod';
import { SyncServiceImpl } from '../services/sync/index.js';
import { validateApiKey } from '../middleware/auth.js';
import logger from '../utils/logger.js';

const router = Router();
const syncService = new SyncServiceImpl();

// Schema for sync request
const startSyncSchema = z.object({
  tenantId: z.string().uuid(),
  syncType: z.enum(['full', 'incremental']).default('incremental'),
  channelIds: z.array(z.string()).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

/**
 * Start a sync job for a tenant
 */
router.post('/sync', validateApiKey, async (req, res, next) => {
  try {
    const validationResult = startSyncSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validationResult.error.issues,
      });
    }

    const { tenantId, syncType, channelIds, startDate, endDate } =
      validationResult.data;

    const result = await syncService.startSync(tenantId, {
      syncType,
      channelIds,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    if (!result.success) {
      return res.status(400).json({
        error: result.error?.message || 'Failed to start sync',
        code: result.error?.code,
      });
    }

    logger.info('Sync job started', {
      jobId: result.data.jobId,
      tenantId,
      syncType,
    });

    return res.status(201).json({
      jobId: result.data.jobId,
      message: 'Sync job started successfully',
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * Get sync job status
 */
router.get('/sync/jobs/:jobId', validateApiKey, async (req, res, next) => {
  try {
    const { jobId } = req.params;

    const result = await syncService.getJobStatus(jobId);

    if (!result.success) {
      return res.status(404).json({
        error: result.error?.message || 'Job not found',
        code: result.error?.code,
      });
    }

    return res.json(result.data);
  } catch (error) {
    return next(error);
  }
});

/**
 * Cancel a sync job
 */
router.delete('/sync/jobs/:jobId', validateApiKey, async (req, res, next) => {
  try {
    const { jobId } = req.params;

    const result = await syncService.cancelJob(jobId);

    if (!result.success) {
      return res.status(400).json({
        error: result.error?.message || 'Failed to cancel job',
        code: result.error?.code,
      });
    }

    logger.info('Sync job cancelled', { jobId });

    return res.json({
      message: 'Job cancelled successfully',
      cancelled: result.data.cancelled,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * Get sync history for a tenant
 */
router.get(
  '/sync/history/:tenantId',
  validateApiKey,
  async (req, res, next) => {
    try {
      const { tenantId } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;

      const result = await syncService.getSyncHistory(tenantId, limit);

      if (!result.success) {
        return res.status(400).json({
          error: result.error?.message || 'Failed to get sync history',
          code: result.error?.code,
        });
      }

      return res.json({
        history: result.data,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Retry a failed sync job
 */
router.post(
  '/sync/jobs/:jobId/retry',
  validateApiKey,
  async (req, res, next) => {
    try {
      const { jobId } = req.params;

      const result = await syncService.retryJob(jobId);

      if (!result.success) {
        return res.status(400).json({
          error: result.error?.message || 'Failed to retry job',
          code: result.error?.code,
        });
      }

      logger.info('Sync job retried', {
        originalJobId: jobId,
        newJobId: result.data.jobId,
      });

      return res.status(201).json({
        jobId: result.data.jobId,
        message: 'Job retried successfully',
      });
    } catch (error) {
      return next(error);
    }
  }
);

export default router;
