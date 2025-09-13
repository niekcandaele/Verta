# Technical Design

## Architecture Overview

The Knowledge Base Linking feature integrates external documentation sources into Verta's search capabilities. The system uses a crawler-based approach with intelligent content chunking and vector embeddings for semantic search.

```
Admin UI → Admin API → Knowledge Base Service
                            ↓
                    Knowledge Base Queue
                            ↓
                    Knowledge Base Worker
                         ↙      ↘
                Web Crawler    ML Service
                      ↓            ↓
                  Content      Embeddings
                      ↘          ↙
                     TiDB Database
```

## Component Design

### KnowledgeBaseService

**Location:** `backend/src/services/knowledgeBase/KnowledgeBaseService.ts`

Manages CRUD operations for knowledge base configurations:
- Validates sitemap URLs
- Creates knowledge base records
- Enqueues crawl jobs
- Tracks processing status

### SitemapCrawler

**Location:** `backend/src/services/knowledgeBase/SitemapCrawler.ts`

Handles sitemap fetching and parsing:
- Supports standard XML sitemap format
- Handles sitemap index files
- Validates URLs before processing
- Respects robots.txt directives
- Implements rate limiting

### ContentExtractor

**Location:** `backend/src/services/knowledgeBase/ContentExtractor.ts`

Extracts and processes HTML content:
- Removes navigation, headers, footers
- Preserves document structure
- Extracts text with formatting hints
- Calculates content checksums
- Handles various HTML structures

### ChunkingService

**Location:** `backend/src/services/knowledgeBase/ChunkingService.ts`

Implements intelligent content chunking with multiple strategies:

#### Structural Chunking
- Uses HTML elements as natural boundaries
- Identifies headings, sections, articles
- Preserves document hierarchy

#### Semantic Chunking
- Calculates sentence embeddings
- Finds semantic break points
- Maintains coherent chunks

#### Hybrid Approach
```
for each structural section:
  if section < 300 tokens:
    merge with adjacent sections up to 500 tokens
  elif section > 800 tokens:
    apply semantic splitting:
      - Calculate sentence embeddings
      - Find semantic break points (similarity < threshold)
      - Ensure minimum chunk size of 300 tokens
  create chunk with 20% overlap from previous
```

### KnowledgeBaseWorker

**Location:** `backend/src/workers/knowledgeBaseWorker.ts`

Processes crawl jobs asynchronously:
- Fetches sitemaps
- Iterates through URLs
- Checks content changes via checksums
- Chunks modified content
- Generates embeddings
- Stores in database

Processing logic:
```
fetch sitemap
for each URL in sitemap:
  fetch HTML content
  calculate checksum
  if checksum differs from stored:
    extract text from HTML
    chunk content using semantic chunking
    generate embeddings
    store with checksum in database
```

## Data Models

### Database Schema

```sql
CREATE TABLE knowledge_bases (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  sitemap_url VARCHAR(2048) NOT NULL,
  last_crawled_at TIMESTAMP,
  status ENUM('active', 'inactive', 'processing', 'failed'),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  INDEX idx_knowledge_bases_tenant (tenant_id)
);

CREATE TABLE knowledge_base_chunks (
  id CHAR(36) PRIMARY KEY,
  knowledge_base_id CHAR(36) NOT NULL,
  source_url VARCHAR(2048) NOT NULL,
  title VARCHAR(1024),
  heading_hierarchy JSON,
  content TEXT NOT NULL,
  embedding VECTOR(1536),
  chunk_index INT NOT NULL,
  total_chunks INT NOT NULL,
  start_char_index INT,
  end_char_index INT,
  overlap_with_previous INT DEFAULT 0,
  checksum VARCHAR(64),
  chunk_method ENUM('semantic', 'fixed_size', 'structural') DEFAULT 'semantic',
  token_count INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  INDEX idx_kb_chunks_kb_id (knowledge_base_id),
  INDEX idx_kb_chunks_source_url (source_url),
  VECTOR INDEX idx_kb_chunks_embedding ((VEC_COSINE_DISTANCE(embedding)))
);
```

### TypeScript Interfaces

```typescript
interface KnowledgeBase {
  id: string
  tenantId: string
  name: string
  sitemapUrl: string
  lastCrawledAt?: Date
  status: 'active' | 'inactive' | 'processing' | 'failed'
  createdAt: Date
  updatedAt: Date
}

interface KnowledgeBaseChunk {
  id: string
  knowledgeBaseId: string
  sourceUrl: string
  title?: string
  headingHierarchy?: string[]
  content: string
  embedding?: number[]
  chunkIndex: number
  totalChunks: number
  startCharIndex?: number
  endCharIndex?: number
  overlapWithPrevious: number
  checksum: string
  chunkMethod: 'semantic' | 'fixed_size' | 'structural'
  tokenCount: number
  createdAt: Date
  updatedAt: Date
}

interface CrawlJobData {
  knowledgeBaseId: string
  tenantId: string
  isManual: boolean
  crawlType: 'initial' | 'update'
}
```

## Search Integration

### SearchService Modifications

Add knowledge base chunks to search configuration:
```typescript
{
  table: 'knowledge_base_chunks',
  text_field: 'content',
  vector_field: 'embedding',
  filters: { tenant_id },
  rank_weight: 0.8,  // Between golden_answers (1.0) and messages (0.6)
  metadata_fields: ['source_url', 'title', 'heading_hierarchy']
}
```

### Result Ranking

Fixed hierarchy ensures quality:
1. Golden answers (weight: 1.0) - Curated, verified content
2. Knowledge base (weight: 0.8) - Official documentation
3. Messages (weight: 0.6) - Community discussions

## API Endpoints

### Admin Endpoints

```
POST   /api/admin/knowledge-bases
  Body: { name: string, sitemapUrl: string }
  Response: KnowledgeBase

GET    /api/admin/knowledge-bases
  Query: { limit?: number, offset?: number }
  Response: { items: KnowledgeBase[], total: number }

PUT    /api/admin/knowledge-bases/:id
  Body: { name?: string, sitemapUrl?: string }
  Response: KnowledgeBase

DELETE /api/admin/knowledge-bases/:id
  Response: { success: boolean }

POST   /api/admin/knowledge-bases/:id/crawl
  Response: { jobId: string }

GET    /api/admin/knowledge-bases/:id/status
  Response: {
    status: string,
    progress: number,
    errors: string[],
    stats: {
      pagesProcessed: number,
      chunksCreated: number,
      timeElapsed: number
    }
  }
```

## Security Considerations

### Crawling Security
- Only HTTPS sitemap URLs accepted
- Robots.txt compliance mandatory
- Rate limiting to prevent abuse
- User-agent identifies as Verta
- No authentication support (public content only)

### Data Security
- Content sanitization before storage
- Admin authentication required
- Tenant isolation enforced
- No PII extraction

## Performance Optimizations

### Crawling Performance
- Concurrent page processing (max 5)
- Checksum-based change detection
- Incremental updates only
- Connection pooling

### Processing Performance
- Batch embedding generation (10 chunks)
- Async queue processing
- Database transaction batching
- Chunk size optimization

### Search Performance
- Vector indexes on embeddings
- Metadata caching
- Query result pagination
- Parallel search execution

## Monitoring and Observability

### Metrics
- Crawl duration and pages processed
- Chunk creation rate
- Embedding generation time
- Search inclusion rate
- Error rates by type

### Logging
- Crawl start/end with stats
- Page processing errors
- Chunking decisions
- Search performance

### Alerts
- Crawl failures
- High error rates
- Performance degradation
- Storage threshold

## Testing Strategy

### Unit Tests
- URL validation
- Sitemap parsing
- Content extraction
- Chunking algorithms
- Checksum calculation

### Integration Tests
- End-to-end crawling
- Database operations
- Search integration
- API endpoints

### Quality Tests
- Chunk coherence
- Overlap effectiveness
- Search relevance
- Source attribution

## Deployment Considerations

### Feature Flags
- `KNOWLEDGE_BASE_ENABLED`: Master switch
- `KNOWLEDGE_BASE_AUTO_CRAWL`: Weekly scheduling
- `KNOWLEDGE_BASE_SEARCH`: Search inclusion

### Migration Strategy
1. Deploy with features disabled
2. Run migrations
3. Test with single knowledge base
4. Enable search integration
5. Enable weekly scheduling

### Rollback Plan
- Feature flags for instant disable
- Migrations are reversible
- Chunks can be marked inactive
- No impact on existing functionality