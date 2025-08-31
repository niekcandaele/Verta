import { Kysely } from 'kysely';
import { v4 as uuidv4 } from 'uuid';
import type {
  Database,
  QuestionInstance,
  NewQuestionInstance,
  QuestionInstanceUpdate,
} from '../database/types.js';
import { BaseCrudRepositoryImpl } from './BaseCrudRepository.js';

export interface QuestionInstanceWithCluster extends QuestionInstance {
  cluster_representative_text?: string;
  cluster_instance_count?: number;
  cluster_thread_title?: string | null;
}

export class QuestionInstanceRepository extends BaseCrudRepositoryImpl<
  QuestionInstance,
  NewQuestionInstance,
  QuestionInstanceUpdate
> {
  constructor(db: Kysely<Database>) {
    super(db, 'question_instances');
  }

  /**
   * Find instances by cluster ID
   */
  async findByClusterId(
    clusterId: string,
    options?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<QuestionInstance[]> {
    const { limit = 100, offset = 0 } = options || {};

    const results = await this.db
      .selectFrom('question_instances')
      .selectAll()
      .where('cluster_id', '=', clusterId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    return results.map((row) => this.mapRowToEntity(row));
  }

  /**
   * Find instance by thread ID (unique)
   */
  async findByThreadId(threadId: string): Promise<QuestionInstance | null> {
    const result = await this.db
      .selectFrom('question_instances')
      .selectAll()
      .where('thread_id', '=', threadId)
      .executeTakeFirst();

    return result ? this.mapRowToEntity(result) : null;
  }

  /**
   * Find instances with cluster information
   */
  async findWithClusterInfo(
    tenantId: string,
    options?: {
      limit?: number;
      offset?: number;
      minConfidence?: number;
    }
  ): Promise<QuestionInstanceWithCluster[]> {
    const { limit = 100, offset = 0, minConfidence = 0 } = options || {};

    const results = await this.db
      .selectFrom('question_instances as qi')
      .innerJoin('question_clusters as qc', 'qi.cluster_id', 'qc.id')
      .select([
        'qi.id',
        'qi.cluster_id',
        'qi.thread_id',
        'qi.thread_title',
        'qi.original_text',
        'qi.rephrased_text',
        'qi.confidence_score',
        'qi.created_at',
        'qc.representative_text as cluster_representative_text',
        'qc.instance_count as cluster_instance_count',
        'qc.thread_title as cluster_thread_title',
      ])
      .where('qc.tenant_id', '=', tenantId)
      .where('qi.confidence_score', '>=', minConfidence)
      .orderBy('qi.created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    return results.map((row) => ({
      ...this.mapRowToEntity(row),
      cluster_representative_text: row.cluster_representative_text,
      cluster_instance_count: row.cluster_instance_count,
      cluster_thread_title: row.cluster_thread_title,
    }));
  }

  /**
   * Batch create instances
   */
  async createBatch(
    instances: NewQuestionInstance[]
  ): Promise<QuestionInstance[]> {
    const rows = instances.map((instance) => this.mapCreateDataToRow(instance));

    await this.db.insertInto('question_instances').values(rows).execute();

    // Fetch created instances
    const ids = rows.map((row) => row.id);
    const results = await this.db
      .selectFrom('question_instances')
      .selectAll()
      .where('id', 'in', ids)
      .execute();

    return results.map((row) => this.mapRowToEntity(row));
  }

  /**
   * Get statistics by cluster
   */
  async getStatsByCluster(clusterId: string): Promise<{
    total_instances: number;
    avg_confidence: number;
    with_rephrasing: number;
  }> {
    const result = await this.db
      .selectFrom('question_instances')
      .select((eb) => [
        eb.fn.count('id').as('total_instances'),
        eb.fn.avg('confidence_score').as('avg_confidence'),
        eb.fn
          .count(eb.case().when('rephrased_text', 'is not', null).then(1).end())
          .as('with_rephrasing'),
      ])
      .where('cluster_id', '=', clusterId)
      .executeTakeFirst();

    return {
      total_instances: Number(result?.total_instances || 0),
      avg_confidence: Number(result?.avg_confidence || 0),
      with_rephrasing: Number(result?.with_rephrasing || 0),
    };
  }

  /**
   * Delete instances by cluster ID
   */
  async deleteByClusterId(clusterId: string): Promise<number> {
    const result = await this.db
      .deleteFrom('question_instances')
      .where('cluster_id', '=', clusterId)
      .executeTakeFirst();

    return Number(result.numDeletedRows);
  }

  protected mapRowToEntity(row: any): QuestionInstance {
    return {
      id: row.id,
      cluster_id: row.cluster_id,
      thread_id: row.thread_id,
      thread_title: row.thread_title,
      original_text: row.original_text,
      rephrased_text: row.rephrased_text,
      confidence_score: Number(row.confidence_score),
      created_at: new Date(row.created_at),
    };
  }

  protected mapCreateDataToRow(data: NewQuestionInstance): any {
    return {
      id: data.id || uuidv4(),
      cluster_id: data.cluster_id,
      thread_id: data.thread_id,
      thread_title: data.thread_title || null,
      original_text: data.original_text,
      rephrased_text: data.rephrased_text || null,
      confidence_score: data.confidence_score,
    };
  }

  protected mapUpdateDataToRow(data: QuestionInstanceUpdate): any {
    const row: any = {};

    if (data.cluster_id !== undefined) {
      row.cluster_id = data.cluster_id;
    }
    if (data.rephrased_text !== undefined) {
      row.rephrased_text = data.rephrased_text;
    }
    if (data.thread_title !== undefined) {
      row.thread_title = data.thread_title;
    }
    if (data.confidence_score !== undefined) {
      row.confidence_score = data.confidence_score;
    }

    return row;
  }
}
