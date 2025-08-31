import { Router, Request, Response } from 'express';
import { addAnalysisJob, getJobStatus } from '../../../queues/analysisQueue.js';
import { AnalysisJobRepository } from '../../../repositories/AnalysisJobRepository.js';
import { db } from '../../../database/index.js';
import {
  isFeatureEnabledForTenant,
  getFeatureFlag,
} from '../../../config/features.js';
import logger from '../../../utils/logger.js';

const router = Router();
const jobRepo = new AnalysisJobRepository(db);

/**
 * Admin authentication middleware
 */
const requireAdminKey = (
  req: Request,
  res: Response,
  next: any
): void | Response => {
  const apiKey = req.headers['x-api-key'];

  // Check against admin API key from environment
  const adminKey = process.env.ADMIN_API_KEY || 'ikbeneenaap';

  if (apiKey !== adminKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
};

/**
 * Trigger thread analysis for a tenant
 * POST /api/admin/analysis/trigger
 */
router.post(
  '/trigger',
  requireAdminKey,
  async (req: Request, res: Response): Promise<Response> => {
    try {
      const { tenantId, channelIds, threadMinAgeDays, forceReprocess } =
        req.body;

      if (!tenantId) {
        return res.status(400).json({ error: 'tenantId is required' });
      }

      // Add job to queue
      const jobId = await addAnalysisJob({
        tenantId,
        channelIds,
        threadMinAgeDays,
        forceReprocess,
      });

      logger.info('Analysis job triggered', {
        jobId,
        tenantId,
        channelIds,
        threadMinAgeDays,
        forceReprocess,
      });

      return res.json({
        jobId,
        status: 'queued',
        message: 'Analysis job queued successfully',
      });
    } catch (error: any) {
      logger.error('Failed to trigger analysis', error);
      return res.status(500).json({ error: 'Failed to trigger analysis' });
    }
  }
);

/**
 * Get job status
 * GET /api/admin/analysis/job/:jobId
 */
router.get(
  '/job/:jobId',
  requireAdminKey,
  async (req: Request, res: Response): Promise<Response> => {
    try {
      const { jobId } = req.params;

      const status = await getJobStatus(jobId);

      if (!status) {
        return res.status(404).json({ error: 'Job not found' });
      }

      // Get detailed job info from database
      const dbJob: any = null; // TODO: Add findByJobId method

      return res.json({
        ...status,
        dbStatus: dbJob
          ? {
              status: dbJob.status,
              processedItems: dbJob.processed_items,
              totalItems: dbJob.total_items,
              startedAt: dbJob.started_at,
              completedAt: dbJob.completed_at,
            }
          : null,
      });
    } catch (error: any) {
      logger.error('Failed to get job status', error);
      return res.status(500).json({ error: 'Failed to get job status' });
    }
  }
);

/**
 * Get analysis history for a tenant
 * GET /api/admin/analysis/history/:tenantId
 */
router.get(
  '/history/:tenantId',
  requireAdminKey,
  async (req: Request, res: Response): Promise<Response> => {
    try {
      const { tenantId } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;

      const jobs = await jobRepo.findByTenant(tenantId, { limit });

      return res.json({
        tenantId,
        jobs,
        count: jobs.length,
      });
    } catch (error: any) {
      logger.error('Failed to get analysis history', error);
      return res.status(500).json({ error: 'Failed to get analysis history' });
    }
  }
);

/**
 * Trigger analysis by tenant slug
 * POST /api/admin/analysis/trigger-by-slug
 */
router.post(
  '/trigger-by-slug',
  requireAdminKey,
  async (req: Request, res: Response): Promise<Response> => {
    try {
      const { tenantSlug, channelIds, threadMinAgeDays, forceReprocess } =
        req.body;

      if (!tenantSlug) {
        return res.status(400).json({ error: 'tenantSlug is required' });
      }

      // Look up tenant by slug
      const tenant = await db
        .selectFrom('tenants')
        .select(['id', 'name', 'slug'])
        .where('slug', '=', tenantSlug)
        .executeTakeFirst();

      if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      // Check if feature is enabled for this tenant
      if (!isFeatureEnabledForTenant(tenant.slug, 'questionClustering')) {
        return res.status(403).json({
          error: 'Question clustering feature is not enabled for this tenant',
        });
      }

      // Get feature configuration
      // const analysisConfig = getFeatureFlag('analysis');
      const clusteringConfig = getFeatureFlag('questionClustering');

      // Add job to queue with feature flag overrides
      const jobId = await addAnalysisJob({
        tenantId: tenant.id,
        channelIds,
        threadMinAgeDays: threadMinAgeDays || clusteringConfig.minThreadAgeDays,
        forceReprocess,
      });

      logger.info('Analysis job triggered by slug', {
        jobId,
        tenantSlug,
        tenantId: tenant.id,
        channelIds,
        threadMinAgeDays,
        forceReprocess,
      });

      return res.json({
        jobId,
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
        },
        status: 'queued',
        message: 'Analysis job queued successfully',
      });
    } catch (error: any) {
      logger.error('Failed to trigger analysis by slug', error);
      return res.status(500).json({ error: 'Failed to trigger analysis' });
    }
  }
);

export default router;
