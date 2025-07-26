/**
 * Sync service implementation
 */

import { syncQueue } from '../../queues/syncQueue.js';
import logger from '../../utils/logger.js';
import type { SyncService } from './SyncService.js';
import type { ServiceResult } from '../types.js';
import { ServiceErrorType } from '../types.js';
import type { SyncJobData, SyncJobResult } from '../../types/sync.js';
import type { TenantRepository } from '../../repositories/tenant/index.js';
import { TenantRepositoryImpl } from '../../repositories/tenant/index.js';
import { db } from '../../database/index.js';

/**
 * Implementation of the sync service
 */
export class SyncServiceImpl implements SyncService {
  private tenantRepo: TenantRepository;

  constructor() {
    this.tenantRepo = new TenantRepositoryImpl(db);
  }

  async startSync(
    tenantId: string,
    options?: Partial<Omit<SyncJobData, 'tenantId'>>
  ): Promise<ServiceResult<{ jobId: string }>> {
    try {
      // Verify tenant exists
      const tenant = await this.tenantRepo.findById(tenantId);
      if (!tenant) {
        return {
          success: false,
          error: {
            type: ServiceErrorType.NOT_FOUND,
            code: 'TENANT_NOT_FOUND',
            message: 'Tenant not found',
          },
        };
      }

      // Check if tenant is active
      if (tenant.status !== 'ACTIVE') {
        return {
          success: false,
          error: {
            type: ServiceErrorType.BUSINESS_RULE_VIOLATION,
            code: 'TENANT_NOT_ACTIVE',
            message: 'Tenant is not active',
          },
        };
      }

      // Create sync job data
      const jobData: SyncJobData = {
        tenantId,
        syncType: options?.syncType || 'incremental',
        channelIds: options?.channelIds,
        startDate: options?.startDate,
        endDate: options?.endDate,
      };

      // Add job to queue
      const job = await syncQueue.add('sync-tenant', jobData, {
        // Job options
        delay: 0,
        removeOnComplete: {
          age: 24 * 3600, // Keep for 24 hours
          count: 100, // Keep last 100
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // Keep for 7 days
        },
      });

      logger.info('Sync job created', {
        jobId: job.id,
        tenantId,
        syncType: jobData.syncType,
      });

      return {
        success: true,
        data: { jobId: job.id! },
      };
    } catch (error) {
      logger.error('Failed to start sync', { tenantId, error });
      return {
        success: false,
        error: {
          type: ServiceErrorType.INTERNAL_ERROR,
          code: 'SYNC_START_FAILED',
          message: 'Failed to start sync job',
        },
      };
    }
  }

  async getJobStatus(jobId: string): Promise<
    ServiceResult<{
      status: 'waiting' | 'active' | 'completed' | 'failed';
      progress?: any;
      result?: SyncJobResult;
      error?: string;
    }>
  > {
    try {
      const job = await syncQueue.getJob(jobId);

      if (!job) {
        return {
          success: false,
          error: {
            type: ServiceErrorType.NOT_FOUND,
            code: 'JOB_NOT_FOUND',
            message: 'Job not found',
          },
        };
      }

      const state = await job.getState();
      const progress = job.progress;

      let status: 'waiting' | 'active' | 'completed' | 'failed';
      switch (state) {
        case 'waiting':
        case 'delayed':
          status = 'waiting';
          break;
        case 'active':
          status = 'active';
          break;
        case 'completed':
          status = 'completed';
          break;
        case 'failed':
          status = 'failed';
          break;
        default:
          status = 'waiting';
      }

      const response: any = {
        status,
        progress,
      };

      if (status === 'completed' && job.returnvalue) {
        response.result = job.returnvalue as SyncJobResult;
      }

      if (status === 'failed' && job.failedReason) {
        response.error = job.failedReason;
      }

      return {
        success: true,
        data: response,
      };
    } catch (error) {
      logger.error('Failed to get job status', { jobId, error });
      return {
        success: false,
        error: {
          type: ServiceErrorType.INTERNAL_ERROR,
          code: 'STATUS_CHECK_FAILED',
          message: 'Failed to get job status',
        },
      };
    }
  }

  async cancelJob(
    jobId: string
  ): Promise<ServiceResult<{ cancelled: boolean }>> {
    try {
      const job = await syncQueue.getJob(jobId);

      if (!job) {
        return {
          success: false,
          error: {
            type: ServiceErrorType.NOT_FOUND,
            code: 'JOB_NOT_FOUND',
            message: 'Job not found',
          },
        };
      }

      const state = await job.getState();

      // Can only cancel waiting or active jobs
      if (state !== 'waiting' && state !== 'active' && state !== 'delayed') {
        return {
          success: false,
          error: {
            type: ServiceErrorType.BUSINESS_RULE_VIOLATION,
            code: 'JOB_NOT_CANCELLABLE',
            message: `Cannot cancel job in ${state} state`,
          },
        };
      }

      await job.remove();

      logger.info('Sync job cancelled', { jobId });

      return {
        success: true,
        data: { cancelled: true },
      };
    } catch (error) {
      logger.error('Failed to cancel job', { jobId, error });
      return {
        success: false,
        error: {
          type: ServiceErrorType.INTERNAL_ERROR,
          code: 'CANCEL_FAILED',
          message: 'Failed to cancel job',
        },
      };
    }
  }

  async getSyncHistory(
    tenantId: string,
    limit: number = 10
  ): Promise<
    ServiceResult<
      Array<{
        jobId: string;
        status: string;
        startedAt: Date;
        completedAt?: Date;
        result?: SyncJobResult;
      }>
    >
  > {
    try {
      // Get all jobs from the queue
      const jobs = await syncQueue.getJobs(['completed', 'failed'], 0, limit);

      // Filter jobs for this tenant
      const tenantJobs = jobs
        .filter((job) => job.data.tenantId === tenantId)
        .slice(0, limit);

      const history = await Promise.all(
        tenantJobs.map(async (job) => {
          const state = await job.getState();
          const result: any = {
            jobId: job.id!,
            status: state,
            startedAt: new Date(job.processedOn || job.timestamp),
          };

          if (state === 'completed') {
            result.completedAt = job.finishedOn
              ? new Date(job.finishedOn)
              : undefined;
            result.result = job.returnvalue as SyncJobResult;
          }

          return result;
        })
      );

      return {
        success: true,
        data: history,
      };
    } catch (error) {
      logger.error('Failed to get sync history', { tenantId, error });
      return {
        success: false,
        error: {
          type: ServiceErrorType.INTERNAL_ERROR,
          code: 'HISTORY_FETCH_FAILED',
          message: 'Failed to get sync history',
        },
      };
    }
  }

  async retryJob(jobId: string): Promise<ServiceResult<{ jobId: string }>> {
    try {
      const job = await syncQueue.getJob(jobId);

      if (!job) {
        return {
          success: false,
          error: {
            type: ServiceErrorType.NOT_FOUND,
            code: 'JOB_NOT_FOUND',
            message: 'Job not found',
          },
        };
      }

      const state = await job.getState();

      // Can only retry failed jobs
      if (state !== 'failed') {
        return {
          success: false,
          error: {
            type: ServiceErrorType.BUSINESS_RULE_VIOLATION,
            code: 'JOB_NOT_RETRIABLE',
            message: `Cannot retry job in ${state} state`,
          },
        };
      }

      // Create a new job with the same data
      const newJob = await syncQueue.add('sync-tenant', job.data, {
        delay: 0,
        removeOnComplete: {
          age: 24 * 3600,
          count: 100,
        },
        removeOnFail: {
          age: 7 * 24 * 3600,
        },
      });

      logger.info('Sync job retried', {
        originalJobId: jobId,
        newJobId: newJob.id,
        tenantId: job.data.tenantId,
      });

      return {
        success: true,
        data: { jobId: newJob.id! },
      };
    } catch (error) {
      logger.error('Failed to retry job', { jobId, error });
      return {
        success: false,
        error: {
          type: ServiceErrorType.INTERNAL_ERROR,
          code: 'RETRY_FAILED',
          message: 'Failed to retry job',
        },
      };
    }
  }
}
