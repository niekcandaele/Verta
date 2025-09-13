import { Kysely } from 'kysely';
import { v4 as uuidv4 } from 'uuid';
import type {
  Database,
  KnowledgeBaseChunk,
  NewKnowledgeBaseChunk,
} from '../../database/types.js';
import type { KnowledgeBaseChunkRepository } from './types.js';

/**
 * Repository implementation for knowledge base chunk operations
 */
export class KnowledgeBaseChunkRepositoryImpl implements KnowledgeBaseChunkRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Create a new chunk
   */
  async create(data: NewKnowledgeBaseChunk): Promise<KnowledgeBaseChunk> {
    const id = data.id || uuidv4();
    const chunkData = { ...data, id };

    // Insert without returningAll for MySQL/TiDB compatibility
    await this.db
      .insertInto('knowledge_base_chunks')
      .values(chunkData)
      .execute();

    // Fetch the created record
    const result = await this.db
      .selectFrom('knowledge_base_chunks')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

    return result;
  }

  /**
   * Create multiple chunks in batch
   */
  async createBatch(chunks: NewKnowledgeBaseChunk[]): Promise<KnowledgeBaseChunk[]> {
    if (chunks.length === 0) {
      return [];
    }

    const chunksWithIds = chunks.map(chunk => ({
      ...chunk,
      id: chunk.id || uuidv4(),
    }));

    // Insert without returningAll for MySQL/TiDB compatibility
    await this.db
      .insertInto('knowledge_base_chunks')
      .values(chunksWithIds)
      .execute();

    // Fetch all created records
    const ids = chunksWithIds.map(chunk => chunk.id);
    const results = await this.db
      .selectFrom('knowledge_base_chunks')
      .selectAll()
      .where('id', 'in', ids)
      .execute();

    return results;
  }

  /**
   * Find chunks by knowledge base ID
   */
  async findByKnowledgeBase(knowledgeBaseId: string): Promise<KnowledgeBaseChunk[]> {
    return this.db
      .selectFrom('knowledge_base_chunks')
      .selectAll()
      .where('knowledge_base_id', '=', knowledgeBaseId)
      .orderBy('chunk_index', 'asc')
      .execute();
  }

  /**
   * Find chunks by source URL
   */
  async findBySourceUrl(sourceUrl: string): Promise<KnowledgeBaseChunk[]> {
    return this.db
      .selectFrom('knowledge_base_chunks')
      .selectAll()
      .where('source_url', '=', sourceUrl)
      .orderBy('chunk_index', 'asc')
      .execute();
  }

  /**
   * Delete chunks by knowledge base ID
   */
  async deleteByKnowledgeBase(knowledgeBaseId: string): Promise<void> {
    await this.db
      .deleteFrom('knowledge_base_chunks')
      .where('knowledge_base_id', '=', knowledgeBaseId)
      .execute();
  }

  /**
   * Delete chunks by source URL
   */
  async deleteBySourceUrl(knowledgeBaseId: string, sourceUrl: string): Promise<void> {
    await this.db
      .deleteFrom('knowledge_base_chunks')
      .where('knowledge_base_id', '=', knowledgeBaseId)
      .where('source_url', '=', sourceUrl)
      .execute();
  }

  /**
   * Find chunks by checksum (for change detection)
   */
  async findByChecksum(
    knowledgeBaseId: string,
    checksum: string
  ): Promise<KnowledgeBaseChunk | undefined> {
    return this.db
      .selectFrom('knowledge_base_chunks')
      .selectAll()
      .where('knowledge_base_id', '=', knowledgeBaseId)
      .where('checksum', '=', checksum)
      .executeTakeFirst();
  }

  /**
   * Get chunk count for a knowledge base
   */
  async getChunkCount(knowledgeBaseId: string): Promise<number> {
    const result = await this.db
      .selectFrom('knowledge_base_chunks')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('knowledge_base_id', '=', knowledgeBaseId)
      .executeTakeFirstOrThrow();

    return parseInt(result.count, 10);
  }
}