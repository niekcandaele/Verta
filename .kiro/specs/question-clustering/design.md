# Question Clustering Design

## Overview

This design implements an ML-powered question clustering system that processes Discord threads to identify, extract, and group similar support questions. The system uses a two-service architecture with Node.js for orchestration and Python for ML model hosting, leveraging TiDB's vector search capabilities for similarity matching.

## Architecture

### System Components

```
┌─────────────────┐     ┌──────────────────┐
│   Discord API   │────▶│  Sync Service    │
└─────────────────┘     └────────┬─────────┘
                                 │
                                 ▼
┌─────────────────┐     ┌──────────────────┐
│  Admin API      │────▶│ Analysis Worker  │
└─────────────────┘     └────────┬─────────┘
                                 │
                    ┌────────────┴────────────┐
                    ▼                         ▼
         ┌──────────────────┐     ┌──────────────────┐
         │ Thread Processing │────▶│   ML Service     │
         │     Service       │     │   (Python)       │
         └────────┬──────────┘     └──────────────────┘
                  │                          │
                  ▼                          ▼
         ┌──────────────────┐     ┌──────────────────┐
         │  Clustering Svc   │     │  LLM Service     │
         └────────┬──────────┘     │ (Gemini Flash)   │
                  │                └──────────────────┘
                  ▼
         ┌──────────────────┐
         │   TiDB Vector    │
         │    Database      │
         └──────────────────┘
```

### Data Flow

1. **Thread Ingestion**: Discord threads synced to database via existing sync pipeline
2. **Analysis Trigger**: Admin API triggers batch processing for eligible threads (5+ days old)
3. **Content Aggregation**: Thread messages concatenated with author context
4. **Question Extraction**: LLM rephrases multi-part discussions into concise questions
5. **Embedding Generation**: BGE-M3 model creates 1024-dimension vectors
6. **Similarity Search**: TiDB vector search finds similar existing questions
7. **Clustering Decision**: Questions >70% similar join existing clusters, others create new ones

## Components and Interfaces

### Python ML Service

FastAPI service exposing three core endpoints:

```python
POST /api/ml/classify
# Determines if text is a question
# Input: { "text": string }
# Output: { "is_question": bool, "confidence": float }

POST /api/ml/rephrase  
# Extracts core question using Gemini Flash
# Input: { "messages": [...], "context": string }
# Output: { "rephrased_text": string, "confidence": float }

POST /api/ml/embed
# Generates embeddings using BGE-M3
# Input: { "text": string }
# Output: { "embedding": float[], "dimension": 1024 }
```

### Thread Processing Service

Orchestrates the ML pipeline for each thread:

```typescript
interface ThreadProcessor {
  aggregateThreadContent(threadId: string): ThreadContent
  extractPrimaryQuestion(content: ThreadContent): Question | null
  processThread(threadId: string): ProcessedThread | null
}
```

### Clustering Service

Manages question similarity and clustering:

```typescript
interface ClusteringService {
  findSimilarQuestions(embedding: number[], threshold: number): Question[]
  assignToCluster(question: Question): ClusterId
  createNewCluster(question: Question): ClusterId
}
```

## Database Schema

### Question Clusters Table
```sql
CREATE TABLE question_clusters (
  id VARCHAR(36) PRIMARY KEY,
  tenant_id VARCHAR(36) NOT NULL,
  representative_question TEXT NOT NULL,
  embedding VECTOR(1024) NOT NULL,
  instance_count INT DEFAULT 1,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  VECTOR INDEX idx_embedding (embedding)
)
```

### Question Instances Table
```sql
CREATE TABLE question_instances (
  id VARCHAR(36) PRIMARY KEY,
  cluster_id VARCHAR(36) NOT NULL,
  thread_id VARCHAR(36) NOT NULL,
  original_content TEXT,
  extracted_question TEXT NOT NULL,
  confidence FLOAT,
  created_at TIMESTAMP,
  FOREIGN KEY (cluster_id) REFERENCES question_clusters(id)
)
```

## Technical Decisions

### Two-Stage Clustering
- **Stage 1**: Exact match at 85% similarity for high-confidence clustering
- **Stage 2**: Broader match at 70% for related questions
- Prevents over-fragmentation while maintaining accuracy

### Thread-Based Processing
- Process entire threads, not individual messages
- Provides full context for better question extraction
- Aligns with Discord's forum structure

### Simplified Question Extraction
- LLM prompts focus on extracting core issues under 15 words
- Removes specific details (error codes, tool names) for better clustering
- Examples guide consistent extraction patterns

### Resource Optimization
- CPU-optimized models (no GPU required)
- 4GB memory limit for Python service
- Batch processing to minimize API calls
- Circuit breaker pattern for resilience

## Configuration

### Environment Variables
```bash
# ML Service
ML_SERVICE_URL=http://ml-service:8000
ML_SERVICE_API_KEY=<generated>
ML_SERVICE_TIMEOUT=30000

# LLM Configuration  
OPENROUTER_API_KEY=<api-key>
OPENROUTER_MODEL=google/gemini-flash-1.5-8b

# Clustering
SIMILARITY_THRESHOLD=0.70
THREAD_MIN_AGE_DAYS=5
BATCH_SIZE=100
```

### Feature Flags
```typescript
{
  questionClustering: {
    enabled: true,
    tenants: ['takaro'],
    minThreadAgeDays: 5,
    similarityThreshold: 0.70
  }
}
```

## API Endpoints

### Admin Endpoints (Protected)
```
POST /api/admin/analysis/trigger-by-slug
# Trigger analysis for specific tenant
# Body: { tenantSlug, channelIds?, forceReprocess? }

GET /api/admin/analysis/job/:jobId
# Check job status and progress
```

### Public Endpoints
```
GET /api/v1/questions/clusters
# Get clustered questions for tenant
# Query: { tenantId, limit?, offset? }

GET /api/v1/questions/clusters/:clusterId
# Get specific cluster with all instances
```

## Performance Considerations

- Vector indexes on embedding columns for fast similarity search
- Connection pooling for database efficiency
- Redis queue for background job processing
- Exponential backoff for external API calls
- Circuit breaker prevents cascade failures

## Security

- API key authentication for ML service
- Admin endpoints require authentication
- Tenant isolation enforced at query level
- No PII in embeddings or clusters
- Rate limiting on all public endpoints