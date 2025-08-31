import { Router, Request, Response } from 'express';
import { QuestionClusterRepository } from '../../../repositories/QuestionClusterRepository.js';
import { QuestionInstanceRepository } from '../../../repositories/QuestionInstanceRepository.js';
import { db } from '../../../database/index.js';
import logger from '../../../utils/logger.js';

const router = Router();
const clusterRepo = new QuestionClusterRepository(db);
const instanceRepo = new QuestionInstanceRepository(db);

/**
 * Get clustered questions for a tenant
 * GET /api/v1/questions/clusters
 */
router.get(
  '/clusters',
  async (req: Request, res: Response): Promise<Response> => {
    try {
      const tenantId = req.query.tenantId as string;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const sortBy = (req.query.sortBy as string) || 'instance_count';
      const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';

      if (!tenantId) {
        return res.status(400).json({ error: 'tenantId is required' });
      }

      const clusters = await clusterRepo.findByTenant(tenantId, {
        limit,
        offset,
        sortBy: sortBy as any,
        sortOrder,
      });

      // Get total count for pagination
      const stats = await clusterRepo.getStatsByTenant(tenantId);

      return res.json({
        clusters,
        pagination: {
          limit,
          offset,
          total: stats.total_clusters,
          hasMore: offset + limit < stats.total_clusters,
        },
      });
    } catch (error: any) {
      logger.error('Failed to get clusters', error);
      return res.status(500).json({ error: 'Failed to get clusters' });
    }
  }
);

/**
 * Get clusters by tenant slug
 * GET /api/v1/questions/clusters-by-slug
 */
router.get(
  '/clusters-by-slug',
  async (req: Request, res: Response): Promise<Response> => {
    try {
      const tenantSlug = req.query.tenantSlug as string;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const sortBy = (req.query.sortBy as string) || 'instance_count';
      const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';

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

      const clusters = await clusterRepo.findByTenant(tenant.id, {
        limit,
        offset,
        sortBy: sortBy as any,
        sortOrder,
      });

      // Get total count for pagination
      const stats = await clusterRepo.getStatsByTenant(tenant.id);

      return res.json({
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
        },
        clusters,
        pagination: {
          limit,
          offset,
          total: stats.total_clusters,
          hasMore: offset + limit < stats.total_clusters,
        },
      });
    } catch (error: any) {
      logger.error('Failed to get clusters by slug', error);
      return res.status(500).json({ error: 'Failed to get clusters' });
    }
  }
);

/**
 * Get details of a specific cluster including instances
 * GET /api/v1/questions/clusters/:clusterId
 */
router.get(
  '/clusters/:clusterId',
  async (req: Request, res: Response): Promise<Response> => {
    try {
      const { clusterId } = req.params;

      const cluster = await clusterRepo.findById(clusterId);

      if (!cluster) {
        return res.status(404).json({ error: 'Cluster not found' });
      }

      // Get all instances in this cluster
      const instances = await instanceRepo.findByClusterId(clusterId);

      return res.json({
        cluster,
        instances,
        instanceCount: instances.length,
      });
    } catch (error: any) {
      logger.error('Failed to get cluster details', error);
      return res.status(500).json({ error: 'Failed to get cluster details' });
    }
  }
);

/**
 * Get cluster statistics for a tenant
 * GET /api/v1/questions/stats
 */
router.get('/stats', async (req: Request, res: Response): Promise<Response> => {
  try {
    const tenantId = req.query.tenantId as string;
    const tenantSlug = req.query.tenantSlug as string;

    let resolvedTenantId = tenantId;

    // If slug provided, look up tenant
    if (!resolvedTenantId && tenantSlug) {
      const tenant = await db
        .selectFrom('tenants')
        .select(['id', 'name', 'slug'])
        .where('slug', '=', tenantSlug)
        .executeTakeFirst();

      if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found' });
      }
      resolvedTenantId = tenant.id;
    }

    if (!resolvedTenantId) {
      return res
        .status(400)
        .json({ error: 'tenantId or tenantSlug is required' });
    }

    // Get statistics
    const stats = await clusterRepo.getStatsByTenant(resolvedTenantId);

    // Get additional stats
    const recentClusters = await clusterRepo.findByTenant(resolvedTenantId, {
      limit: 5,
      sortBy: 'last_seen_at',
      sortOrder: 'desc',
    });

    const topClusters = await clusterRepo.findByTenant(resolvedTenantId, {
      limit: 5,
      sortBy: 'instance_count',
      sortOrder: 'desc',
    });

    return res.json({
      tenantId: resolvedTenantId,
      stats: {
        totalClusters: stats.total_clusters,
        totalInstances: stats.total_instances,
        averageConfidence: 0.85, // TODO: Add to stats query
        averageInstancesPerCluster:
          stats.total_clusters > 0
            ? Math.round((stats.total_instances / stats.total_clusters) * 100) /
              100
            : 0,
      },
      recentClusters: recentClusters.map((c) => ({
        id: c.id,
        text: c.representative_text,
        instanceCount: c.instance_count,
        lastSeen: c.last_seen_at,
      })),
      topClusters: topClusters.map((c) => ({
        id: c.id,
        text: c.representative_text,
        instanceCount: c.instance_count,
      })),
    });
  } catch (error: any) {
    logger.error('Failed to get cluster statistics', error);
    return res.status(500).json({ error: 'Failed to get statistics' });
  }
});

/**
 * Get recent questions (latest instances)
 * GET /api/v1/questions/recent
 */
router.get(
  '/recent',
  async (req: Request, res: Response): Promise<Response> => {
    try {
      const tenantId = req.query.tenantId as string;
      const tenantSlug = req.query.tenantSlug as string;
      const limit = parseInt(req.query.limit as string) || 10;

      let resolvedTenantId = tenantId;

      // If slug provided, look up tenant
      if (!resolvedTenantId && tenantSlug) {
        const tenant = await db
          .selectFrom('tenants')
          .select(['id'])
          .where('slug', '=', tenantSlug)
          .executeTakeFirst();

        if (!tenant) {
          return res.status(404).json({ error: 'Tenant not found' });
        }
        resolvedTenantId = tenant.id;
      }

      if (!resolvedTenantId) {
        return res
          .status(400)
          .json({ error: 'tenantId or tenantSlug is required' });
      }

      // Get clusters sorted by last_seen_at
      const recentClusters = await clusterRepo.findByTenant(resolvedTenantId, {
        limit,
        sortBy: 'last_seen_at',
        sortOrder: 'desc',
      });

      return res.json({
        questions: recentClusters.map((cluster) => ({
          id: cluster.id,
          text: cluster.representative_text,
          threadTitle: cluster.thread_title,
          instanceCount: cluster.instance_count,
          firstSeen: cluster.first_seen_at,
          lastSeen: cluster.last_seen_at,
        })),
      });
    } catch (error: any) {
      logger.error('Failed to get recent questions', error);
      return res.status(500).json({ error: 'Failed to get recent questions' });
    }
  }
);

export default router;
