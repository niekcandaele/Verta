import { Kysely } from 'kysely';
import { v4 as uuidv4 } from 'uuid';
import { BaseCrudRepositoryImpl } from './BaseCrudRepository.js';
import type {
  Database,
  GoldenAnswer,
  NewGoldenAnswer,
  GoldenAnswerUpdate,
} from '../database/types.js';
import type { PaginatedResult, PaginationOptions } from './types.js';

/**
 * Repository for managing golden answers
 */
export class GoldenAnswerRepository extends BaseCrudRepositoryImpl<
  GoldenAnswer,
  NewGoldenAnswer,
  GoldenAnswerUpdate
> {
  constructor(protected readonly db: Kysely<Database>) {
    super(db, 'golden_answers');
  }

  /**
   * Find golden answer by cluster ID
   */
  async findByClusterId(clusterId: string): Promise<GoldenAnswer | null> {
    const row = await this.db
      .selectFrom('golden_answers')
      .selectAll()
      .where('cluster_id', '=', clusterId)
      .executeTakeFirst();

    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Find all golden answers for a tenant
   */
  async findByTenantId(
    tenantId: string,
    pagination?: PaginationOptions
  ): Promise<PaginatedResult<GoldenAnswer>> {
    const {
      page = 1,
      limit = 10,
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = pagination || {};

    const offset = (page - 1) * limit;

    const [dataQuery, countQuery] = await Promise.all([
      this.db
        .selectFrom('golden_answers')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .orderBy(sortBy as any, sortOrder)
        .limit(limit)
        .offset(offset)
        .execute(),
      this.db
        .selectFrom('golden_answers')
        .select((eb) => eb.fn.count('id').as('count'))
        .where('tenant_id', '=', tenantId)
        .executeTakeFirst(),
    ]);

    const total = Number(countQuery?.count || 0);
    const totalPages = Math.ceil(total / limit);
    const data = dataQuery.map((row) => this.mapRowToEntity(row));

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Upsert golden answer (create or update based on cluster_id)
   */
  async upsert(data: NewGoldenAnswer): Promise<GoldenAnswer> {
    // Check if answer already exists for this cluster
    const existing = await this.findByClusterId(data.cluster_id);

    if (existing) {
      // Update existing answer
      const updateData: GoldenAnswerUpdate = {
        answer: data.answer,
        answer_format: data.answer_format,
        created_by: data.created_by,
      };
      
      const updated = await this.update(existing.id, updateData);
      if (!updated) {
        throw new Error('Failed to update golden answer');
      }
      return updated;
    } else {
      // Create new answer
      return this.create(data);
    }
  }

  /**
   * Delete golden answer by cluster ID
   */
  async deleteByClusterId(clusterId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('golden_answers')
      .where('cluster_id', '=', clusterId)
      .executeTakeFirst();

    return Number(result.numDeletedRows) > 0;
  }

  /**
   * Find golden answers with cluster details
   */
  async findWithClusterDetails(
    tenantId: string,
    pagination?: PaginationOptions
  ): Promise<PaginatedResult<GoldenAnswer & { cluster: any }>> {
    const {
      page = 1,
      limit = 10,
      sortBy = 'instance_count',
      sortOrder = 'desc',
    } = pagination || {};

    const offset = (page - 1) * limit;

    const [dataQuery, countQuery] = await Promise.all([
      this.db
        .selectFrom('golden_answers')
        .innerJoin(
          'question_clusters',
          'golden_answers.cluster_id',
          'question_clusters.id'
        )
        .selectAll('golden_answers')
        .select([
          'question_clusters.representative_text',
          'question_clusters.thread_title',
          'question_clusters.instance_count',
          'question_clusters.first_seen_at',
          'question_clusters.last_seen_at',
        ])
        .where('golden_answers.tenant_id', '=', tenantId)
        .orderBy(`question_clusters.${sortBy}` as any, sortOrder)
        .limit(limit)
        .offset(offset)
        .execute(),
      this.db
        .selectFrom('golden_answers')
        .select((eb) => eb.fn.count('id').as('count'))
        .where('tenant_id', '=', tenantId)
        .executeTakeFirst(),
    ]);

    const total = Number(countQuery?.count || 0);
    const totalPages = Math.ceil(total / limit);

    const data = dataQuery.map((row) => ({
      ...this.mapRowToEntity(row),
      cluster: {
        representative_text: row.representative_text,
        thread_title: row.thread_title,
        instance_count: row.instance_count,
        first_seen_at: row.first_seen_at,
        last_seen_at: row.last_seen_at,
      },
    }));

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Map database row to GoldenAnswer entity
   */
  protected mapRowToEntity(row: any): GoldenAnswer {
    return {
      id: row.id,
      cluster_id: row.cluster_id,
      tenant_id: row.tenant_id,
      answer: row.answer,
      answer_format: row.answer_format,
      embedding: row.embedding,
      created_by: row.created_by,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  /**
   * Map create data to database row format
   */
  protected mapCreateDataToRow(data: NewGoldenAnswer): any {
    return {
      id: data.id || uuidv4(),
      cluster_id: data.cluster_id,
      tenant_id: data.tenant_id,
      answer: data.answer,
      answer_format: data.answer_format || 'markdown',
      created_by: data.created_by,
      created_at: data.created_at || new Date().toISOString(),
      updated_at: data.updated_at || new Date().toISOString(),
    };
  }

  /**
   * Map update data to database row format
   */
  protected mapUpdateDataToRow(data: GoldenAnswerUpdate): any {
    const row: any = {};

    if (data.answer !== undefined) {
      row.answer = data.answer;
    }
    if (data.answer_format !== undefined) {
      row.answer_format = data.answer_format;
    }
    if (data.created_by !== undefined) {
      row.created_by = data.created_by;
    }

    return row;
  }
}