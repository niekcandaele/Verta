import { Kysely, sql } from 'kysely';
import { v4 as uuidv4 } from 'uuid';
import type {
  Database,
  QuestionCluster,
  NewQuestionCluster,
  QuestionClusterUpdate,
} from '../database/types.js';
import { BaseCrudRepositoryImpl } from './BaseCrudRepository.js';

export interface SimilarCluster {
  id: string;
  representative_text: string;
  similarity: number;
  instance_count: number;
}

export class QuestionClusterRepository extends BaseCrudRepositoryImpl<
  QuestionCluster,
  NewQuestionCluster,
  QuestionClusterUpdate
> {
  constructor(db: Kysely<Database>) {
    super(db, 'question_clusters');
  }

  /**
   * Find similar clusters using vector similarity search
   * @param embedding The embedding vector to search with
   * @param tenantId The tenant ID to search within
   * @param threshold Minimum similarity threshold (0-1)
   * @param limit Maximum number of results
   */
  async findSimilarClusters(
    embedding: number[],
    tenantId: string,
    threshold: number = 0.85,
    limit: number = 10
  ): Promise<SimilarCluster[]> {
    // Convert embedding array to JSON string for TiDB vector format
    const embeddingStr = JSON.stringify(embedding);

    // Use TiDB's vector similarity function
    const results = await sql<SimilarCluster>`
      SELECT 
        id,
        representative_text,
        instance_count,
        1 - VEC_COSINE_DISTANCE(embedding, ${embeddingStr}) as similarity
      FROM question_clusters
      WHERE tenant_id = ${tenantId}
        AND 1 - VEC_COSINE_DISTANCE(embedding, ${embeddingStr}) >= ${threshold}
      ORDER BY similarity DESC
      LIMIT ${limit}
    `.execute(this.db);

    return results.rows;
  }

  /**
   * Find the most similar cluster above a threshold
   */
  async findMostSimilarCluster(
    embedding: number[],
    tenantId: string,
    threshold: number = 0.85
  ): Promise<SimilarCluster | null> {
    const results = await this.findSimilarClusters(
      embedding,
      tenantId,
      threshold,
      1
    );
    return results[0] || null;
  }

  /**
   * Get clusters by tenant with pagination
   */
  async findByTenant(
    tenantId: string,
    options?: {
      limit?: number;
      offset?: number;
      sortBy?: 'instance_count' | 'last_seen_at' | 'created_at';
      sortOrder?: 'asc' | 'desc';
    }
  ): Promise<QuestionCluster[]> {
    const {
      limit = 50,
      offset = 0,
      sortBy = 'instance_count',
      sortOrder = 'desc',
    } = options || {};

    const results = await this.db
      .selectFrom('question_clusters')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .orderBy(sortBy, sortOrder)
      .limit(limit)
      .offset(offset)
      .execute();

    return results.map((row) => this.mapRowToEntity(row));
  }

  /**
   * Update cluster statistics when a new instance is added
   */
  async incrementInstanceCount(
    clusterId: string,
    lastSeenAt: Date
  ): Promise<void> {
    await this.db
      .updateTable('question_clusters')
      .set({
        instance_count: sql`instance_count + 1`,
        last_seen_at: lastSeenAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .where('id', '=', clusterId)
      .execute();
  }

  /**
   * Get cluster statistics for a tenant
   */
  async getStatsByTenant(tenantId: string): Promise<{
    total_clusters: number;
    total_instances: number;
    avg_instances_per_cluster: number;
  }> {
    const result = await this.db
      .selectFrom('question_clusters')
      .select((eb) => [
        eb.fn.count('id').as('total_clusters'),
        eb.fn.sum('instance_count').as('total_instances'),
        eb.fn.avg('instance_count').as('avg_instances_per_cluster'),
      ])
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();

    return {
      total_clusters: Number(result?.total_clusters || 0),
      total_instances: Number(result?.total_instances || 0),
      avg_instances_per_cluster: Number(result?.avg_instances_per_cluster || 0),
    };
  }

  protected mapRowToEntity(row: any): QuestionCluster {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      representative_text: row.representative_text,
      embedding:
        typeof row.embedding === 'string'
          ? JSON.parse(row.embedding)
          : row.embedding,
      instance_count: row.instance_count,
      first_seen_at: new Date(row.first_seen_at),
      last_seen_at: new Date(row.last_seen_at),
      metadata: row.metadata,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  protected mapCreateDataToRow(data: NewQuestionCluster): any {
    return {
      id: data.id || uuidv4(),
      tenant_id: data.tenant_id,
      representative_text: data.representative_text,
      embedding: JSON.stringify(data.embedding),
      instance_count: data.instance_count ?? 1,
      first_seen_at:
        data.first_seen_at instanceof Date
          ? data.first_seen_at.toISOString()
          : data.first_seen_at || new Date().toISOString(),
      last_seen_at:
        data.last_seen_at instanceof Date
          ? data.last_seen_at.toISOString()
          : data.last_seen_at || new Date().toISOString(),
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
    };
  }

  protected mapUpdateDataToRow(data: QuestionClusterUpdate): any {
    const row: any = {};

    if (data.representative_text !== undefined) {
      row.representative_text = data.representative_text;
    }
    if (data.embedding !== undefined) {
      row.embedding = JSON.stringify(data.embedding);
    }
    if (data.instance_count !== undefined) {
      row.instance_count = data.instance_count;
    }
    if (data.last_seen_at !== undefined) {
      row.last_seen_at =
        data.last_seen_at instanceof Date
          ? data.last_seen_at.toISOString()
          : data.last_seen_at;
    }
    if (data.metadata !== undefined) {
      row.metadata = JSON.stringify(data.metadata);
    }

    return row;
  }
}
