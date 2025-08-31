import { Kysely } from 'kysely';
import { randomUUID } from 'crypto';
import type {
  Database,
  OcrResult,
  NewOcrResult,
  OcrResultUpdate,
  OcrStatus,
} from '../../database/types.js';

export interface OcrResultRepository {
  create(data: NewOcrResult): Promise<OcrResult>;
  findById(id: string): Promise<OcrResult | null>;
  findByAttachment(attachmentId: string): Promise<OcrResult[]>;
  findLatestByAttachment(attachmentId: string): Promise<OcrResult | null>;
  updateStatus(
    id: string,
    status: OcrStatus,
    errorMessage?: string
  ): Promise<void>;
  markFailed(
    id: string,
    errorMessage: string,
    retryCount: number
  ): Promise<void>;
  deleteByAttachment(attachmentId: string): Promise<number>;
}

/**
 * Implementation of OcrResultRepository using Kysely
 */
export class OcrResultRepositoryImpl implements OcrResultRepository {
  constructor(private db: Kysely<Database>) {}

  /**
   * Create a new OCR result
   */
  async create(data: NewOcrResult): Promise<OcrResult> {
    const id = randomUUID();
    const insertData = {
      id,
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await this.db.insertInto('ocr_results').values(insertData).execute();

    const result = await this.db
      .selectFrom('ocr_results')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!result) {
      throw new Error('Failed to create OCR result');
    }

    return this.mapRowToEntity(result);
  }

  /**
   * Find OCR result by ID
   */
  async findById(id: string): Promise<OcrResult | null> {
    const result = await this.db
      .selectFrom('ocr_results')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    return result ? this.mapRowToEntity(result) : null;
  }

  /**
   * Find all OCR results for an attachment
   */
  async findByAttachment(attachmentId: string): Promise<OcrResult[]> {
    const results = await this.db
      .selectFrom('ocr_results')
      .selectAll()
      .where('attachment_id', '=', attachmentId)
      .orderBy('created_at', 'desc')
      .execute();

    return results.map((row) => this.mapRowToEntity(row));
  }

  /**
   * Find the latest OCR result for an attachment
   */
  async findLatestByAttachment(
    attachmentId: string
  ): Promise<OcrResult | null> {
    const result = await this.db
      .selectFrom('ocr_results')
      .selectAll()
      .where('attachment_id', '=', attachmentId)
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst();

    return result ? this.mapRowToEntity(result) : null;
  }

  /**
   * Update OCR result status
   */
  async updateStatus(
    id: string,
    status: OcrStatus,
    errorMessage?: string
  ): Promise<void> {
    const updateData: OcrResultUpdate = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (errorMessage !== undefined) {
      updateData.error_message = errorMessage;
    }

    await this.db
      .updateTable('ocr_results')
      .set(updateData)
      .where('id', '=', id)
      .execute();
  }

  /**
   * Mark OCR result as failed with error details
   */
  async markFailed(
    id: string,
    errorMessage: string,
    retryCount: number
  ): Promise<void> {
    await this.db
      .updateTable('ocr_results')
      .set({
        status: 'failed' as OcrStatus,
        error_message: errorMessage,
        retry_count: retryCount,
        updated_at: new Date().toISOString(),
      })
      .where('id', '=', id)
      .execute();
  }

  /**
   * Delete all OCR results for an attachment
   */
  async deleteByAttachment(attachmentId: string): Promise<number> {
    const result = await this.db
      .deleteFrom('ocr_results')
      .where('attachment_id', '=', attachmentId)
      .executeTakeFirst();

    return Number(result.numDeletedRows);
  }

  /**
   * Find failed OCR results that are ready for retry
   */
  async findFailedResults(options?: {
    minAgeMs?: number; // Minimum age in milliseconds
    maxRetryCount?: number; // Maximum retry count to consider
    limit?: number;
  }): Promise<OcrResult[]> {
    const { 
      minAgeMs = 3600000, // Default 1 hour
      maxRetryCount = 10, // Default max 10 total retries
      limit = 100 
    } = options || {};

    const minAge = new Date(Date.now() - minAgeMs);
    
    const results = await this.db
      .selectFrom('ocr_results')
      .selectAll()
      .where('status', '=', 'failed')
      .where('retry_count', '<', maxRetryCount)
      .where('updated_at', '<', minAge as any)
      .orderBy('updated_at', 'asc')
      .limit(limit)
      .execute();

    return results.map(this.mapRowToEntity);
  }

  /**
   * Map database row to domain entity
   */
  private mapRowToEntity(row: any): OcrResult {
    return {
      id: row.id,
      attachment_id: row.attachment_id,
      model_version: row.model_version,
      extracted_text: row.extracted_text,
      confidence: row.confidence ? Number(row.confidence) : null,
      status: row.status as OcrStatus,
      error_message: row.error_message,
      retry_count: Number(row.retry_count),
      processing_time_ms: row.processing_time_ms
        ? Number(row.processing_time_ms)
        : null,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }
}