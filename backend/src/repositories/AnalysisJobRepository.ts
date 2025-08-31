import { Kysely, sql } from 'kysely';
import { v4 as uuidv4 } from 'uuid';
import type {
  Database,
  AnalysisJob,
  NewAnalysisJob,
  AnalysisJobUpdate,
} from '../database/types.js';
import { BaseCrudRepositoryImpl } from './BaseCrudRepository.js';

export type JobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface JobProgress {
  progress: number;
  processed_items: number;
  total_items: number;
  message?: string;
}

export class AnalysisJobRepository extends BaseCrudRepositoryImpl<
  AnalysisJob,
  NewAnalysisJob,
  AnalysisJobUpdate
> {
  constructor(db: Kysely<Database>) {
    super(db, 'analysis_jobs');
  }

  /**
   * Find jobs by tenant
   */
  async findByTenant(
    tenantId: string,
    options?: {
      status?: JobStatus;
      limit?: number;
      offset?: number;
    }
  ): Promise<AnalysisJob[]> {
    const { status, limit = 50, offset = 0 } = options || {};

    let query = this.db
      .selectFrom('analysis_jobs')
      .selectAll()
      .where('tenant_id', '=', tenantId);

    if (status) {
      query = query.where('status', '=', status);
    }

    const results = await query
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    return results.map((row) => this.mapRowToEntity(row));
  }

  /**
   * Find active jobs (pending or processing)
   */
  async findActiveJobs(tenantId?: string): Promise<AnalysisJob[]> {
    let query = this.db
      .selectFrom('analysis_jobs')
      .selectAll()
      .where((eb) =>
        eb.or([eb('status', '=', 'pending'), eb('status', '=', 'processing')])
      );

    if (tenantId) {
      query = query.where('tenant_id', '=', tenantId);
    }

    const results = await query.orderBy('created_at', 'asc').execute();

    return results.map((row) => this.mapRowToEntity(row));
  }

  /**
   * Update job status
   */
  async updateStatus(
    jobId: string,
    status: JobStatus,
    errorDetails?: any
  ): Promise<void> {
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'processing' && !updateData.started_at) {
      updateData.started_at = new Date().toISOString();
    }

    if (
      status === 'completed' ||
      status === 'failed' ||
      status === 'cancelled'
    ) {
      updateData.completed_at = new Date().toISOString();
    }

    if (errorDetails) {
      updateData.error_details = JSON.stringify(errorDetails);
    }

    await this.db
      .updateTable('analysis_jobs')
      .set(updateData)
      .where('id', '=', jobId)
      .execute();
  }

  /**
   * Update job progress
   */
  async updateProgress(jobId: string, progress: JobProgress): Promise<void> {
    await this.db
      .updateTable('analysis_jobs')
      .set({
        progress: progress.progress,
        processed_items: progress.processed_items,
        total_items: progress.total_items,
        updated_at: new Date().toISOString(),
      })
      .where('id', '=', jobId)
      .execute();
  }

  /**
   * Get job statistics for a tenant
   */
  async getStatsByTenant(tenantId: string): Promise<{
    total_jobs: number;
    completed_jobs: number;
    failed_jobs: number;
    avg_processing_time_ms: number;
  }> {
    const stats = await this.db
      .selectFrom('analysis_jobs')
      .select((eb) => [
        eb.fn.count('id').as('total_jobs'),
        eb.fn
          .count(eb.case().when('status', '=', 'completed').then(1).end())
          .as('completed_jobs'),
        eb.fn
          .count(eb.case().when('status', '=', 'failed').then(1).end())
          .as('failed_jobs'),
      ])
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();

    // Calculate average processing time for completed jobs
    // Note: This is a simplified calculation - in production, you might want to use
    // TIMESTAMPDIFF or similar database-specific functions
    const avgTime = await this.db
      .selectFrom('analysis_jobs')
      .select((eb) =>
        eb.fn
          .avg(sql`TIMESTAMPDIFF(MICROSECOND, started_at, completed_at) / 1000`)
          .as('avg_time')
      )
      .where('tenant_id', '=', tenantId)
      .where('status', '=', 'completed')
      .where('started_at', 'is not', null)
      .where('completed_at', 'is not', null)
      .executeTakeFirst();

    return {
      total_jobs: Number(stats?.total_jobs || 0),
      completed_jobs: Number(stats?.completed_jobs || 0),
      failed_jobs: Number(stats?.failed_jobs || 0),
      avg_processing_time_ms: Number(avgTime?.avg_time || 0),
    };
  }

  /**
   * Cancel pending jobs for a tenant
   */
  async cancelPendingJobs(tenantId: string): Promise<number> {
    const result = await this.db
      .updateTable('analysis_jobs')
      .set({
        status: 'cancelled' as JobStatus,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .where('tenant_id', '=', tenantId)
      .where('status', '=', 'pending')
      .executeTakeFirst();

    return Number(result.numUpdatedRows);
  }

  /**
   * Get the latest job for a tenant
   */
  async getLatestJob(
    tenantId: string,
    jobType?: string
  ): Promise<AnalysisJob | null> {
    let query = this.db
      .selectFrom('analysis_jobs')
      .selectAll()
      .where('tenant_id', '=', tenantId);

    if (jobType) {
      query = query.where('job_type', '=', jobType);
    }

    const result = await query.orderBy('created_at', 'desc').executeTakeFirst();

    return result ? this.mapRowToEntity(result) : null;
  }

  protected mapRowToEntity(row: any): AnalysisJob {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      status: row.status as JobStatus,
      job_type: row.job_type,
      parameters: row.parameters,
      progress: row.progress,
      total_items: row.total_items,
      processed_items: row.processed_items,
      thread_min_age_days: row.thread_min_age_days,
      error_details: row.error_details,
      started_at: row.started_at ? new Date(row.started_at) : null,
      completed_at: row.completed_at ? new Date(row.completed_at) : null,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  protected mapCreateDataToRow(data: NewAnalysisJob): any {
    return {
      id: data.id || uuidv4(),
      tenant_id: data.tenant_id,
      status: data.status,
      job_type: data.job_type || 'question_clustering',
      parameters: data.parameters ? JSON.stringify(data.parameters) : null,
      progress: data.progress ?? 0,
      total_items: data.total_items ?? 0,
      processed_items: data.processed_items ?? 0,
      error_details: data.error_details
        ? JSON.stringify(data.error_details)
        : null,
      started_at:
        data.started_at instanceof Date
          ? data.started_at.toISOString()
          : data.started_at || null,
      completed_at:
        data.completed_at instanceof Date
          ? data.completed_at.toISOString()
          : data.completed_at || null,
    };
  }

  protected mapUpdateDataToRow(data: AnalysisJobUpdate): any {
    const row: any = {};

    if (data.status !== undefined) {
      row.status = data.status;
    }
    if (data.parameters !== undefined) {
      row.parameters = JSON.stringify(data.parameters);
    }
    if (data.progress !== undefined) {
      row.progress = data.progress;
    }
    if (data.total_items !== undefined) {
      row.total_items = data.total_items;
    }
    if (data.processed_items !== undefined) {
      row.processed_items = data.processed_items;
    }
    if (data.error_details !== undefined) {
      row.error_details = JSON.stringify(data.error_details);
    }
    if (data.started_at !== undefined) {
      row.started_at =
        data.started_at instanceof Date
          ? data.started_at.toISOString()
          : data.started_at || null;
    }
    if (data.completed_at !== undefined) {
      row.completed_at =
        data.completed_at instanceof Date
          ? data.completed_at.toISOString()
          : data.completed_at || null;
    }

    return row;
  }
}
