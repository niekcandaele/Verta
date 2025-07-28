import { Kysely, sql } from 'kysely';
import { BaseCrudRepositoryImpl } from '../BaseCrudRepository.js';
import type { Database } from '../../database/types.js';

/**
 * Channel sync job entity
 */
export interface ChannelSyncJob {
  id: string;
  tenantId: string;
  channelId: string;
  parentJobId: string;
  workerId?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  messagesProcessed: number;
  errorDetails?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create channel sync job data
 */
export interface CreateChannelSyncJobData {
  tenantId: string;
  channelId: string;
  parentJobId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  workerId?: string;
  messagesProcessed?: number;
  errorDetails?: Record<string, unknown>;
}

/**
 * Update channel sync job data
 */
export interface UpdateChannelSyncJobData {
  workerId?: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  messagesProcessed?: number;
  errorDetails?: Record<string, unknown>;
}

/**
 * Channel sync job repository interface
 */
export interface ChannelSyncJobRepository {
  findById(id: string): Promise<ChannelSyncJob | null>;
  findByParentJobId(parentJobId: string): Promise<ChannelSyncJob[]>;
  findByWorkerId(workerId: string): Promise<ChannelSyncJob[]>;
  claimJob(jobId: string, workerId: string): Promise<ChannelSyncJob | null>;
  updateProgress(jobId: string, messagesProcessed: number): Promise<void>;
  create(data: CreateChannelSyncJobData): Promise<ChannelSyncJob>;
  update(
    id: string,
    data: UpdateChannelSyncJobData
  ): Promise<ChannelSyncJob | null>;
  delete(id: string): Promise<boolean>;
}

/**
 * Implementation of ChannelSyncJobRepository using Kysely
 */
export class ChannelSyncJobRepositoryImpl
  extends BaseCrudRepositoryImpl<
    ChannelSyncJob,
    CreateChannelSyncJobData,
    UpdateChannelSyncJobData
  >
  implements ChannelSyncJobRepository
{
  constructor(db: Kysely<Database>) {
    super(db, 'channel_sync_jobs');
  }

  /**
   * Find channel sync jobs by parent job ID
   */
  async findByParentJobId(parentJobId: string): Promise<ChannelSyncJob[]> {
    const rows = await this.db
      .selectFrom('channel_sync_jobs')
      .selectAll()
      .where('parent_job_id', '=', parentJobId)
      .orderBy('created_at', 'asc')
      .execute();

    return rows.map((row) => this.mapRowToEntity(row));
  }

  /**
   * Find channel sync jobs by worker ID
   */
  async findByWorkerId(workerId: string): Promise<ChannelSyncJob[]> {
    const rows = await this.db
      .selectFrom('channel_sync_jobs')
      .selectAll()
      .where('worker_id', '=', workerId)
      .orderBy('created_at', 'desc')
      .execute();

    return rows.map((row) => this.mapRowToEntity(row));
  }

  /**
   * Claim a job for a worker (atomic operation)
   */
  async claimJob(
    jobId: string,
    workerId: string
  ): Promise<ChannelSyncJob | null> {
    const result = await this.db
      .updateTable('channel_sync_jobs')
      .set({
        worker_id: workerId,
        status: 'in_progress',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .where('id', '=', jobId)
      .where('status', '=', 'pending')
      .where('worker_id', 'is', null)
      .returningAll()
      .executeTakeFirst();

    return result ? this.mapRowToEntity(result) : null;
  }

  /**
   * Update progress for a job
   */
  async updateProgress(
    jobId: string,
    messagesProcessed: number
  ): Promise<void> {
    await this.db
      .updateTable('channel_sync_jobs')
      .set({
        messages_processed: messagesProcessed,
        updated_at: new Date().toISOString(),
      })
      .where('id', '=', jobId)
      .execute();
  }

  /**
   * Map database row to domain entity
   */
  protected mapRowToEntity(row: any): ChannelSyncJob {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      channelId: row.channel_id,
      parentJobId: row.parent_job_id,
      workerId: row.worker_id,
      status: row.status,
      startedAt: row.started_at ? new Date(row.started_at) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      messagesProcessed: row.messages_processed || 0,
      errorDetails: row.error_details || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Map create data to database row format
   */
  protected mapCreateDataToRow(data: CreateChannelSyncJobData): any {
    return {
      id: sql`gen_random_uuid()`,
      tenant_id: data.tenantId,
      channel_id: data.channelId,
      parent_job_id: data.parentJobId,
      worker_id: data.workerId || null,
      status: data.status,
      messages_processed: data.messagesProcessed || 0,
      error_details: data.errorDetails
        ? JSON.stringify(data.errorDetails)
        : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Map update data to database row format
   */
  protected mapUpdateDataToRow(data: UpdateChannelSyncJobData): any {
    const row: any = {
      updated_at: new Date().toISOString(),
    };

    if (data.workerId !== undefined) row.worker_id = data.workerId;
    if (data.status !== undefined) row.status = data.status;
    if (data.startedAt !== undefined)
      row.started_at = data.startedAt.toISOString();
    if (data.completedAt !== undefined)
      row.completed_at = data.completedAt.toISOString();
    if (data.messagesProcessed !== undefined)
      row.messages_processed = data.messagesProcessed;
    if (data.errorDetails !== undefined)
      row.error_details = JSON.stringify(data.errorDetails);

    return row;
  }
}
