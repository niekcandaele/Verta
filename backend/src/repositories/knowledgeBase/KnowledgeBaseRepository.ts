import { Kysely } from 'kysely';
import { v4 as uuidv4 } from 'uuid';
import { BaseCrudRepositoryImpl } from '../BaseCrudRepository.js';
import type {
  Database,
  KnowledgeBase,
  NewKnowledgeBase,
  KnowledgeBaseUpdate,
  KnowledgeBaseChunk,
  NewKnowledgeBaseChunk,
} from '../../database/types.js';
import type { KnowledgeBaseRepository } from './types.js';

/**
 * Repository implementation for knowledge base operations
 */
export class KnowledgeBaseRepositoryImpl
  extends BaseCrudRepositoryImpl<KnowledgeBase, NewKnowledgeBase, KnowledgeBaseUpdate>
  implements KnowledgeBaseRepository
{
  constructor(db: Kysely<Database>) {
    super(db, 'knowledge_bases');
  }

  protected mapRowToEntity(row: any): KnowledgeBase {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      name: row.name,
      description: row.description,
      sitemap_url: row.sitemap_url,
      last_crawled_at: row.last_crawled_at ? new Date(row.last_crawled_at) : null,
      last_crawl_event: row.last_crawl_event ? new Date(row.last_crawl_event) : null,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  protected mapCreateDataToRow(data: NewKnowledgeBase): any {
    return {
      ...data,
      id: data.id || uuidv4(),
    };
  }

  protected mapUpdateDataToRow(data: KnowledgeBaseUpdate): any {
    return data;
  }

  // Use base class create() method which handles TiDB correctly

  // Use base class findById() method which handles TiDB correctly

  /**
   * Find all knowledge bases for a tenant
   */
  async findByTenant(tenantId: string): Promise<KnowledgeBase[]> {
    const results = await this.db
      .selectFrom('knowledge_bases')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .orderBy('created_at', 'desc')
      .execute();

    return results.map(row => this.mapRowToEntity(row));
  }

  // Use base class update() method which handles TiDB correctly

  // Use base class delete() method which handles TiDB correctly


  /**
   * Update last crawled timestamp
   */
  async updateLastCrawled(id: string, timestamp: Date): Promise<void> {
    await this.db
      .updateTable('knowledge_bases')
      .set({ last_crawled_at: timestamp })
      .where('id', '=', id)
      .execute();
  }


  /**
   * Get chunks for a specific URL in a knowledge base
   */
  async getChunksByUrl(knowledgeBaseId: string, sourceUrl: string): Promise<KnowledgeBaseChunk[]> {
    const results = await this.db
      .selectFrom('knowledge_base_chunks')
      .selectAll()
      .where('knowledge_base_id', '=', knowledgeBaseId)
      .where('source_url', '=', sourceUrl)
      .orderBy('chunk_index', 'asc')
      .execute();

    return results.map(row => this.mapChunkRowToEntity(row));
  }

  /**
   * Delete chunks for a specific URL in a knowledge base
   */
  async deleteChunksByUrl(knowledgeBaseId: string, sourceUrl: string): Promise<number> {
    const result = await this.db
      .deleteFrom('knowledge_base_chunks')
      .where('knowledge_base_id', '=', knowledgeBaseId)
      .where('source_url', '=', sourceUrl)
      .execute();

    return Number(result[0]?.numDeletedRows || 0);
  }

  /**
   * Create a new knowledge base chunk
   */
  async createChunk(chunkData: NewKnowledgeBaseChunk): Promise<KnowledgeBaseChunk> {
    const dataWithId = {
      ...chunkData,
      id: chunkData.id || uuidv4(),
      // Ensure heading_hierarchy is properly stringified for TiDB JSON column
      // Check if it's already a string to avoid double-stringifying
      heading_hierarchy: chunkData.heading_hierarchy 
        ? (typeof chunkData.heading_hierarchy === 'string' 
          ? chunkData.heading_hierarchy 
          : JSON.stringify(chunkData.heading_hierarchy))
        : null,
    };

    // Insert without returning for MySQL/TiDB compatibility
    await this.db
      .insertInto('knowledge_base_chunks')
      .values(dataWithId)
      .execute();

    // Fetch the created record
    const result = await this.db
      .selectFrom('knowledge_base_chunks')
      .selectAll()
      .where('id', '=', dataWithId.id)
      .executeTakeFirstOrThrow();

    return this.mapChunkRowToEntity(result);
  }

  /**
   * Map database row to KnowledgeBaseChunk entity
   */
  private mapChunkRowToEntity(row: any): KnowledgeBaseChunk {
    return {
      id: row.id,
      knowledge_base_id: row.knowledge_base_id,
      source_url: row.source_url,
      title: row.title,
      heading_hierarchy: row.heading_hierarchy 
        ? (typeof row.heading_hierarchy === 'string' 
          ? JSON.parse(row.heading_hierarchy) 
          : row.heading_hierarchy)
        : [],
      content: row.content,
      embedding: row.embedding,
      chunk_index: row.chunk_index,
      total_chunks: row.total_chunks,
      start_char_index: row.start_char_index,
      end_char_index: row.end_char_index,
      overlap_with_previous: row.overlap_with_previous,
      checksum: row.checksum,
      chunk_method: row.chunk_method,
      token_count: row.token_count,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  /**
   * Find all knowledge bases with stats and pagination
   */
  async findAllWithStats(options?: {
    page?: number;
    limit?: number;
    sortBy?: 'name' | 'created_at' | 'last_crawled_at';
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    data: Array<{
      id: string;
      tenant_id: string;
      name: string;
      description: string | null;
      sitemap_url: string;
      last_crawled_at: Date | null;
      last_crawl_event: Date | null;
      created_at: Date;
      updated_at: Date;
      chunk_count: number;
      last_chunk_created: Date | null;
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = options || {};

    const offset = (page - 1) * limit;

    // Get total count
    const countResult = await this.db
      .selectFrom('knowledge_bases')
      .select(this.db.fn.count('id').as('count'))
      .executeTakeFirst();

    const total = Number(countResult?.count || 0);
    const totalPages = Math.ceil(total / limit);

    // Get knowledge bases with chunk stats
    const results = await this.db
      .selectFrom('knowledge_bases as kb')
      .leftJoin(
        this.db
          .selectFrom('knowledge_base_chunks')
          .select([
            'knowledge_base_id',
            this.db.fn.count('id').as('chunk_count'),
            this.db.fn.max('created_at').as('last_chunk_created'),
          ])
          .groupBy('knowledge_base_id')
          .as('chunks'),
        'chunks.knowledge_base_id',
        'kb.id'
      )
      .select([
        'kb.id',
        'kb.tenant_id',
        'kb.name',
        'kb.description',
        'kb.sitemap_url',
        'kb.last_crawled_at',
        'kb.last_crawl_event',
        'kb.created_at',
        'kb.updated_at',
        'chunks.chunk_count',
        'chunks.last_chunk_created',
      ])
      .orderBy(`kb.${sortBy}`, sortOrder)
      .limit(limit)
      .offset(offset)
      .execute();

    const data = results.map(row => ({
      id: row.id,
      tenant_id: row.tenant_id,
      name: row.name,
      description: row.description,
      sitemap_url: row.sitemap_url,
      last_crawled_at: row.last_crawled_at ? new Date(row.last_crawled_at) : null,
      last_crawl_event: row.last_crawl_event ? new Date(row.last_crawl_event) : null,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      chunk_count: Number(row.chunk_count || 0),
      last_chunk_created: row.last_chunk_created ? new Date(row.last_chunk_created) : null,
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
}