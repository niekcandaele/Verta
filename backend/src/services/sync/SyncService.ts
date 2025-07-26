/**
 * Sync service interface
 */

import type { ServiceResult } from '../types.js';
import type { SyncJobData, SyncJobResult } from '../../types/sync.js';

/**
 * Service interface for platform sync operations
 */
export interface SyncService {
  /**
   * Start a sync job for a tenant
   * @param tenantId - The tenant to sync
   * @param options - Sync options
   * @returns Service result with job ID or error
   */
  startSync(
    tenantId: string,
    options?: Partial<Omit<SyncJobData, 'tenantId'>>
  ): Promise<ServiceResult<{ jobId: string }>>;

  /**
   * Get sync job status
   * @param jobId - The job ID to check
   * @returns Service result with job status or error
   */
  getJobStatus(jobId: string): Promise<
    ServiceResult<{
      status: 'waiting' | 'active' | 'completed' | 'failed';
      progress?: any;
      result?: SyncJobResult;
      error?: string;
    }>
  >;

  /**
   * Cancel a sync job
   * @param jobId - The job ID to cancel
   * @returns Service result with success status
   */
  cancelJob(jobId: string): Promise<ServiceResult<{ cancelled: boolean }>>;

  /**
   * Get sync history for a tenant
   * @param tenantId - The tenant ID
   * @param limit - Maximum number of jobs to return
   * @returns Service result with job history
   */
  getSyncHistory(
    tenantId: string,
    limit?: number
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
  >;

  /**
   * Retry a failed sync job
   * @param jobId - The job ID to retry
   * @returns Service result with new job ID
   */
  retryJob(jobId: string): Promise<ServiceResult<{ jobId: string }>>;
}
