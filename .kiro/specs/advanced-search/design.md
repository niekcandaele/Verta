# Advanced Hybrid Search Design

## Overview

This design document outlines the implementation strategy for adding comprehensive hybrid search capabilities to Verta. The system will combine vector similarity and text matching to search across both curated golden answers and historical chat archives, providing users with efficient information discovery.

## Problem Statement

Verta currently lacks comprehensive search capabilities. Users cannot efficiently find relevant information across the system's knowledge base, which includes both curated golden answers and historical chat archives. The current vector similarity search only works for question clustering and doesn't provide text-based or hybrid search functionality.

### Current State Issues

1. **Vector Search**: Limited to question clustering with fixed similarity thresholds
2. **No Text Search**: Users cannot search by keywords or phrases
3. **Isolated Content**: Golden answers and message archives are searched separately
4. **No Frontend Search**: No user interface for searching content
5. **Limited Discoverability**: Users must know exact questions to find relevant answers

## Requirements

### Functional Requirements

- REQ-001: The system SHALL implement hybrid search combining vector similarity and text matching
- REQ-002: The system SHALL search golden answers and chat archives equally, relying on reranking models for relevance
- REQ-003: The search API SHALL accept text queries and return ranked results
- REQ-004: The Python service SHALL handle all search logic and database queries
- REQ-005: WHEN TiDB hybrid search is unavailable, THEN the system SHALL return an error (no fallbacks)
- REQ-006: The frontend SHALL provide a search interface with real-time results
- REQ-007: The system SHALL show only message excerpts in search results, requiring click-through for full content

### Non-Functional Requirements

- **Performance**: Search results within 500ms for 95% of queries
- **Scalability**: Support searching across millions of messages
- **Security**: Respect tenant isolation and data boundaries
- **Usability**: Support natural language queries without special syntax
- **Rate Limiting**: 10 searches per second per user, with burst allowance of 20

### Constraints

- Must integrate with existing TiDB database
- Cannot modify existing message ingestion pipeline
- Must use existing Python ML service architecture
- Should leverage TiDB's hybrid search capabilities when available
- Must maintain backward compatibility with existing APIs

## Architecture

### System Architecture

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────────┐
│  Frontend   │────▶│ Backend (Node)  │────▶│ Python ML Service│
│ Search UI   │     │  /api/v1/search │     │  /api/ml/search  │
└─────────────┘     └─────────────────┘     └────────┬─────────┘
                                                      │
                                              ┌───────▼──────────┐
                                              │      TiDB        │
                                              │ - golden_answers │
                                              │ - messages       │
                                              │ - embeddings     │
                                              └──────────────────┘
```

### User Workflows

1. **Quick Search**
   - User types query in search box → System shows top results → User clicks result to view full content

2. **Contextual Search**
   - User searches within a specific context (FAQ vs Archives) → System filters results → User refines search with additional terms

3. **Admin Search Management**
   - Admin reviews popular searches → Identifies gaps in golden answers → Creates new golden answers for common queries

## Components and Interfaces

### External API

#### Search API Endpoint
```
POST /api/v1/search
{
  "query": "how to configure webhooks",
  "limit": 20,
  "searchTypes": ["golden_answers", "messages"],
  "tenantId": "takaro"
}

Response:
{
  "results": [
    {
      "type": "golden_answer",
      "score": 0.95,
      "content": "...",
      "metadata": {...}
    },
    {
      "type": "message",
      "score": 0.89,
      "excerpt": "...first 200 chars...",
      "messageId": "...",
      "metadata": {...}
    }
  ]
}
```

#### Python ML Service Endpoint
```
POST /api/ml/search
{
  "query": "webhook configuration",
  "embedding": [...],
  "searchConfigs": [
    {
      "table": "golden_answers",
      "textField": "answer",
      "vectorField": "embedding",
      "filters": {"tenant_id": "takaro"}
    }
  ]
}
```

## Implementation Details

### Component Implementation

#### SearchService (`backend/src/services/SearchService.ts`)
- **Purpose**: Coordinate search requests between frontend and Python service
- **Integration**: Use existing MlClientService patterns
- **Key Methods**:
  ```typescript
  async search(query, options):
    embedding = await mlClient.embed(query)
    results = await mlClient.search({
      query,
      embedding,
      searchConfigs: buildSearchConfigs(options)
    })
    return formatResults(results)
  ```

#### search.py (`python-ml-service/src/modules/search.py`)
- **Purpose**: Implement hybrid search logic
- **Integration**: Follow existing module patterns (classify.py, embed.py)
- **Key Methods**:
  ```python
  def hybrid_search(query, configs):
    if not tidb_hybrid_search_available():
      raise ServiceUnavailable("TiDB hybrid search not available")
    
    results = []
    # Search all sources equally
    for config in configs:
      results.extend(search_table(query, config))
    
    # Let reranker determine relevance
    return rerank_results(results)
  ```

#### SearchComponent (`frontend/components/Search.tsx`)
- **Purpose**: Search input with real-time results
- **Integration**: Follow existing component patterns (FAQ.tsx)
- **Key Behavior**:
  - Debounce input changes by 300ms
  - Call search API
  - Display results with highlighting

### Database Changes

- Add vector column to both golden_answers and messages tables
- All messages will have direct embedding support
- Extend sync process to generate embeddings for all new messages
- Add background job to generate embeddings for historical messages
- Indexes: messages(channel_id, embedding IS NOT NULL) and golden_answers(tenant_id, embedding IS NOT NULL)

### Embedding Generation Extension

#### Analysis Worker Extension (`backend/src/workers/analysisWorker.ts`)
- **Current Role**: Processes analysis jobs including question clustering
- **Changes**: Add cases for both golden answer and message embedding generation
- **Integration**: Extend existing switch statement to handle both types

#### Sync Process Extension (`backend/src/workers/syncWorker.ts`)
- **Current Role**: Syncs messages from platforms
- **Changes**: Generate embeddings for all new messages during sync
- **Integration**: After storing messages, generate embeddings in batches

## Data Models

### Search Request DTO (`shared-types/search.ts`)
```typescript
interface SearchRequest {
  query: string;
  limit?: number;
  searchTypes?: SearchType[];
  tenantId: string;
}

interface SearchResult {
  type: 'golden_answer' | 'message';
  score: number;
  content?: string;  // Full content for golden answers
  excerpt?: string;  // 200 char excerpt for messages
  messageId?: string;  // For fetching full message
  metadata: Record<string, unknown>;
}
```

## Security Considerations

- Tenant isolation enforced at query level
- API key authentication for Python service calls
- Rate limiting: 10 requests/second per user with burst of 20
- Input sanitization for search queries
- Message privacy: Only 200-char excerpts shown, full content requires explicit access

**Decision**: Show message excerpts only in search results
**Rationale**: Protects context and privacy of original conversations

## Testing Strategy

- **Unit tests**: Search query parsing, result ranking algorithms
- **Integration tests**: End-to-end search workflows, cross-service communication
- **E2E tests**: User search experience, result relevance
- **Performance tests**: Query latency under load

## Rollout Plan

1. **Phase 1**: Deploy Python search module with feature flag
2. **Phase 2**: Add backend API endpoints (disabled by default)
3. **Phase 3**: Deploy frontend with search UI behind feature flag
4. **Phase 4**: Enable for internal testing and tuning
5. **Phase 5**: Gradual rollout to tenants with monitoring
6. **Rollback**: Feature flags allow instant disable at any phase

## Success Criteria

- Users can find relevant content with 80%+ satisfaction rate
- Search latency under 500ms for typical queries
- Reranking model correctly surfaces most relevant results regardless of source
- Support for both exact phrase and semantic search
- All messages and golden answers have embeddings within 7 days of deployment
- New messages get embeddings during sync process (real-time)

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Elasticsearch | Mature full-text search, proven scalability | Additional infrastructure, sync complexity | Not chosen - adds operational overhead |
| Frontend-only search | Simple implementation, no backend changes | Limited to loaded data, poor performance | Not chosen - doesn't scale with data volume |
| SQL LIKE queries | Simple to implement, uses existing DB | Poor performance, no semantic understanding | Not chosen - inadequate for user needs |