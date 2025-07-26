/**
 * Export API routes
 */

import { Router } from 'express';
import { Queue } from 'bullmq';
import type { Kysely } from 'kysely';
import type { Database } from '../database/types.js';
import { validateRequest } from '../middleware/index.js';
import { z } from 'zod';
import { getRedisConnection } from '../config/redis.js';

// Job data types
export interface ExportTenantJobData {
  tenantId: string;
}

export interface ExportAllTenantsJobData {
  // Empty for now, can add filters later
}

// Create export queue
const exportQueue = new Queue('export', {
  connection: getRedisConnection(),
});

// Validation schemas
const exportTenantParamsSchema = z.object({
  tenantId: z.string().uuid(),
});

// Response types
interface ExportJobResponse {
  jobId: string;
  message: string;
}

interface ExportAllJobsResponse {
  jobIds: string[];
  message: string;
}

export interface JobStatusResponse {
  jobId: string;
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';
  progress?: number;
  currentOperation?: string;
  error?: string;
  retryCount?: number;
  executionTimeMs?: number;
  result?: unknown;
}

export function createExportRouter(_database?: Kysely<Database>): Router {
  const router = Router();

  /**
   * POST /api/export/all-tenants
   * Trigger export for all active tenants
   */
  router.post<{}, ExportAllJobsResponse>(
    '/all-tenants',
    async (_req, res, next) => {
      try {
        // Add job to queue
        const job = await exportQueue.add('export-all-tenants', {});

        res.status(202).json({
          jobIds: [job.id!],
          message: 'Export job for all tenants has been queued',
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST /api/export/tenant/:tenantId
   * Trigger export for a specific tenant
   */
  router.post<{ tenantId: string }, ExportJobResponse>(
    '/tenant/:tenantId',
    validateRequest({
      params: exportTenantParamsSchema,
    }),
    async (req, res, next) => {
      try {
        const { tenantId } = req.params;

        // Add job to queue
        const job = await exportQueue.add('export-tenant', { tenantId });

        res.status(202).json({
          jobId: job.id!,
          message: `Export job for tenant ${tenantId} has been queued`,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /api/export/status/:jobId
   * Get status of an export job
   */
  router.get<{ jobId: string }, JobStatusResponse>(
    '/status/:jobId',
    async (req, res, next) => {
      try {
        const { jobId } = req.params;

        // Get job from queue
        const job = await exportQueue.getJob(jobId);

        if (!job) {
          res.status(404).json({
            jobId,
            status: 'failed',
            error: 'Job not found',
          });
          return;
        }

        // Get job state
        const state = await job.getState();
        const progress = job.progress;
        const processedOn = job.processedOn;
        const finishedOn = job.finishedOn;

        // Calculate execution time if available
        let executionTimeMs: number | undefined;
        if (processedOn && finishedOn) {
          executionTimeMs = finishedOn - processedOn;
        }

        // Build response
        const response: JobStatusResponse = {
          jobId: job.id!,
          status: state as JobStatusResponse['status'],
          progress: typeof progress === 'number' ? progress : undefined,
          retryCount: job.attemptsMade,
        };

        // Add execution time if completed
        if (executionTimeMs !== undefined) {
          response.executionTimeMs = executionTimeMs;
        }

        // Add error if failed
        if (state === 'failed' && job.failedReason) {
          response.error = job.failedReason;
        }

        // Add result if completed
        if (state === 'completed' && job.returnvalue) {
          response.result = job.returnvalue;
        }

        // Add current operation if available in job data
        if (
          job.data &&
          typeof job.data === 'object' &&
          'currentOperation' in job.data
        ) {
          response.currentOperation = job.data.currentOperation as string;
        }

        res.json(response);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}

export const exportRouter = createExportRouter();
