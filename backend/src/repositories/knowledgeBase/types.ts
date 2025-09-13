import type {
  KnowledgeBase,
  NewKnowledgeBase,
  KnowledgeBaseUpdate,
  KnowledgeBaseChunk,
  NewKnowledgeBaseChunk,
} from '../../database/types.js';
import type { BaseCrudRepository } from '../types.js';

/**
 * Knowledge base repository interface
 */
export interface KnowledgeBaseRepository extends BaseCrudRepository<KnowledgeBase, NewKnowledgeBase, KnowledgeBaseUpdate> {
  /**
   * Find all knowledge bases for a tenant
   */
  findByTenant(tenantId: string): Promise<KnowledgeBase[]>;

  /**
   * Update last crawled timestamp
   */
  updateLastCrawled(id: string, timestamp: Date): Promise<void>;

  /**
   * Find all knowledge bases with stats and pagination
   */
  findAllWithStats(options?: {
    page?: number;
    limit?: number;
    sortBy?: 'name' | 'created_at' | 'last_crawled_at';
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    data: Array<{
      id: string;
      tenant_id: string;
      name: string;
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
  }>;
}

/**
 * Knowledge base chunk repository interface
 */
export interface KnowledgeBaseChunkRepository {
  /**
   * Create a new chunk
   */
  create(data: NewKnowledgeBaseChunk): Promise<KnowledgeBaseChunk>;

  /**
   * Create multiple chunks in batch
   */
  createBatch(chunks: NewKnowledgeBaseChunk[]): Promise<KnowledgeBaseChunk[]>;

  /**
   * Find chunks by knowledge base ID
   */
  findByKnowledgeBase(knowledgeBaseId: string): Promise<KnowledgeBaseChunk[]>;

  /**
   * Find chunks by source URL
   */
  findBySourceUrl(sourceUrl: string): Promise<KnowledgeBaseChunk[]>;

  /**
   * Delete chunks by knowledge base ID
   */
  deleteByKnowledgeBase(knowledgeBaseId: string): Promise<void>;

  /**
   * Delete chunks by source URL
   */
  deleteBySourceUrl(knowledgeBaseId: string, sourceUrl: string): Promise<void>;

  /**
   * Find chunks by checksum (for change detection)
   */
  findByChecksum(knowledgeBaseId: string, checksum: string): Promise<KnowledgeBaseChunk | undefined>;

  /**
   * Get chunk count for a knowledge base
   */
  getChunkCount(knowledgeBaseId: string): Promise<number>;
}

/**
 * Combined knowledge base operations
 */
export interface KnowledgeBaseOperations {
  /**
   * Get knowledge base with chunk statistics
   */
  getWithStats(id: string): Promise<{
    knowledgeBase: KnowledgeBase;
    chunkCount: number;
    lastChunkCreated?: Date;
  }>;

  /**
   * Get all knowledge bases for a tenant with stats
   */
  getAllWithStats(tenantId: string): Promise<Array<{
    knowledgeBase: KnowledgeBase;
    chunkCount: number;
    lastChunkCreated?: Date;
  }>>;
}