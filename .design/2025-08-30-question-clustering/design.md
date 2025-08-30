# Design: Question Clustering and Analysis System

## Layer 1: Problem & Requirements

### Problem Statement
Discord support channels contain thousands of questions scattered across messages, making it difficult to identify common support issues, frequently asked questions, and knowledge gaps. Support teams need an automated system to identify, classify, and cluster similar questions to improve documentation and support efficiency.

### Current State
The Verta system currently:
- Syncs Discord messages to TiDB database with full content and metadata
- Processes messages in bulk with no semantic analysis
- Stores messages flat without any clustering or categorization
- Has no capability to identify questions or group similar content
- Lacks ML/AI processing infrastructure for content analysis

Pain points:
- Support teams manually review thousands of messages to find patterns
- No visibility into most frequently asked questions
- Duplicate questions create redundant support work
- No automated way to identify knowledge gaps in documentation

### Requirements

#### Functional
- REQ-001: The system SHALL classify messages as questions or non-questions using ML classification
- REQ-002: WHEN a message is identified as a question THEN the system SHALL extract contextual messages from the same author (5 message window)
- REQ-003: The system SHALL rephrase multi-message questions into coherent single questions using Google Gemini Flash LLM
- REQ-004: The system SHALL generate embeddings for questions using a local embeddings model (BGE-M3)
- REQ-005: WHEN processing new questions THEN the system SHALL compare against existing questions using vector similarity
- REQ-006: The system SHALL cluster questions with similarity > 0.85 (configurable) into existing groups
- REQ-007: The system SHALL maintain mappings between question clusters and original Discord messages
- REQ-008: The system SHALL expose Python ML models via HTTP API to Node.js backend
- REQ-009: The system SHALL process messages from a rolling window (30 days to 7 days old) to allow context settling
- REQ-010: The system SHALL support English language content only in initial implementation

#### Non-Functional
- Performance: Process 1000 messages per minute on CPU-only infrastructure
- Scalability: Support millions of messages across multiple tenants
- Accuracy: Achieve >90% accuracy in question classification
- Latency: Respond to API calls within 500ms for classification, 2s for embedding generation
- Resource Usage: Run within 4GB RAM for Python services (no CPU core limits)
- Availability: Gracefully handle ML service downtime with queued retry

### Constraints
- CPU-only environment (no GPU acceleration available)
- Must integrate with existing Node.js/TypeScript backend
- Must use TiDB's vector search capabilities for similarity matching
- Python services must be containerized and orchestrated with existing Docker setup
- Must maintain data isolation between tenants

### Success Criteria
- Reduce time to identify common questions by 90%
- Automatically cluster 80% of similar questions
- Process historical messages within 24 hours of deployment
- Generate actionable insights about question patterns
- Enable future UI features for question exploration

## Layer 2: Functional Specification

### User Workflows

1. **Automated Question Processing**
   - System syncs Discord messages (30-7 days old) → Identifies questions → Extracts context (5 messages) → Rephrases with Gemini Flash → Generates embeddings → Clusters similar questions (>0.85 similarity) → Stores results

2. **Historical Data Processing**
   - Admin triggers processing via authenticated API → System processes messages in rolling window → Updates question clusters → Generates analysis report

3. **Question Analysis Review**
   - Support team queries public API → System returns clustered questions → Team reviews patterns → Updates documentation

### External Interfaces

#### Python ML Service API
```
POST /api/ml/classify
Request: { "text": "Is this a question?" }
Response: { "is_question": true, "confidence": 0.95 }

POST /api/ml/rephrase
Request: { "messages": ["How do I", "configure the", "database?"], "author_id": "..." }
Response: { "rephrased": "How do I configure the database?" }

POST /api/ml/embed
Request: { "text": "How do I configure the database?" }
Response: { "embedding": [0.1, 0.2, ...], "dimensions": 768 }
```

#### Node.js Backend Extensions
```
POST /api/admin/analysis/process-tenant  (Admin auth required)
Request: { "tenant_id": "...", "channel_ids": ["..."] }
Response: { "job_id": "...", "status": "processing" }

GET /api/v1/questions/clusters  (Public access)
Response: { "clusters": [{ "id": "...", "representative": "...", "count": 42 }] }
```

### Alternatives Considered

| Option | Pros | Cons | Why Not Chosen |
|--------|------|------|----------------|
| Cloud ML APIs | Easy integration, high accuracy | Costs, data privacy concerns, latency | Privacy requirements and cost at scale |
| Full Python backend | Simpler ML integration | Major rewrite, loses existing infrastructure | Too disruptive to current system |
| Browser-side ML | No server resources needed | Limited models, poor performance | Insufficient for embeddings generation |
| Rule-based classification | Fast, deterministic | Low accuracy, maintenance burden | Won't catch question variations |

### Key Design Decisions

> **Decision**: Use Google Gemini Flash for question rephrasing  
> **Rationale**: Best balance of cost ($0.075 per 1M tokens) and quality for coherent rephrasing  
> **Alternative**: Local LLM would be free but significantly slower and lower quality

> **Decision**: Process messages from 30 days to 7 days old  
> **Rationale**: Allows messages to "settle" with responses, providing better context for analysis  
> **Alternative**: Processing all messages immediately would miss valuable context from follow-up responses

> **Decision**: 4GB RAM allocation with unlimited CPU cores  
> **Rationale**: BGE-M3 requires ~2GB, classifier ~500MB, leaving headroom. CPU flexibility improves throughput  
> **Alternative**: Fixed CPU cores would limit processing speed unnecessarily

## Layer 3: Technical Specification

### Architecture

```
Discord → Sync Worker → Message Queue → Analysis Worker
                              ↓
                     Python ML Service (HTTP)
                              ↓
                     TiDB Vector Storage
                              ↓
                     Question Clusters
```

### Code Change Analysis

| Component | Action | Justification |
|-----------|--------|---------------|
| Python ML Service | Create | Required for ML model hosting |
| Analysis Worker | Create | Processes messages through ML pipeline |
| Question Repository | Create | Manages question cluster storage |
| TiDB Schema | Extend | Add vector columns and clustering tables |
| Docker Compose | Extend | Add Python service container |
| API Routes | Extend | Add analysis and question endpoints |

### Code to Remove
None - this is entirely new functionality that extends existing systems. No cluster maintenance features will be implemented in the initial version.

### Implementation Approach

#### Components

**Python ML Service** (`python-ml-service/`)
- FastAPI application with async handlers
- Hosts HuggingFace models with CPU optimization
- Provides HTTP endpoints for classification and embedding
- Logic pattern:
  ```
  load models on startup
  for each request:
    validate input
    run inference
    return result with confidence
  ```

**Analysis Worker** (`backend/src/workers/analysisWorker.ts`)
- Extends existing worker patterns from channelSyncWorker
- Processes messages in batches for efficiency
- Integrates with Python service via HTTP
- Processing flow:
  ```
  fetch messages from rolling window (30-7 days old)
  for each batch:
    classify as question/not
    if question:
      get context messages (5 message window)
      rephrase via Gemini Flash
      generate embedding
      find similar questions (>0.85 similarity)
      cluster or create new
  ```

**Question Repository** (`backend/src/repositories/QuestionRepository.ts`)
- Extends BaseCrudRepository for consistency
- Handles vector similarity queries via TiDB
- Manages cluster relationships
- Key methods:
  ```
  findSimilarQuestions(embedding, threshold)
  createCluster(question, messageIds)
  addToCluster(clusterId, messageId)
  getClusterStatistics(tenantId)
  ```

**ML Client Service** (`backend/src/services/MlClientService.ts`)
- HTTP client for Python service communication
- Implements retry logic and circuit breaker
- Caches model availability status
- Interface pattern:
  ```
  classifyText(text) → {is_question, confidence}
  rephraseMessages(messages) → {rephrased_text}
  generateEmbedding(text) → {embedding}
  ```

#### Data Models

**Question Clusters Table**
```sql
CREATE TABLE question_clusters (
  id VARCHAR(36) PRIMARY KEY,
  tenant_id VARCHAR(36) NOT NULL,
  representative_text TEXT NOT NULL,
  embedding VECTOR(768) NOT NULL,
  first_seen_at TIMESTAMP NOT NULL,
  last_seen_at TIMESTAMP NOT NULL,
  occurrence_count INT DEFAULT 1,
  metadata JSON,
  VECTOR INDEX idx_embedding ((VEC_COSINE_DISTANCE(embedding))),
  INDEX idx_tenant_first_seen (tenant_id, first_seen_at)
);
```

**Question Instances Table**
```sql
CREATE TABLE question_instances (
  id VARCHAR(36) PRIMARY KEY,
  cluster_id VARCHAR(36) NOT NULL,
  message_id VARCHAR(36) NOT NULL,
  original_text TEXT NOT NULL,
  rephrased_text TEXT,
  confidence_score FLOAT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cluster_id) REFERENCES question_clusters(id),
  FOREIGN KEY (message_id) REFERENCES messages(id),
  INDEX idx_cluster_created (cluster_id, created_at)
);
```

**Analysis Jobs Table**
```sql
CREATE TABLE analysis_jobs (
  id VARCHAR(36) PRIMARY KEY,
  tenant_id VARCHAR(36) NOT NULL,
  status ENUM('pending', 'processing', 'completed', 'failed'),
  progress JSON,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_details JSON,
  INDEX idx_tenant_status (tenant_id, status)
);
```

#### Security
- Admin API key authentication for analysis triggering endpoints
- Public access for question cluster retrieval endpoints
- Internal API key for Python service communication
- Rate limiting on all endpoints using existing middleware
- Input validation for text length and content
- Tenant isolation enforced at repository layer
- No PII in embeddings or clusters

#### Docker Configuration

**Python ML Service Container**
```yaml
ml-service:
  image: python-ml-service:latest
  mem_limit: 4g
  # No CPU limits - use all available cores
  environment:
    - WORKERS=4
    - MODEL_CACHE_DIR=/models
  volumes:
    - model-cache:/models
```

#### Configuration

**Environment Variables**
```
# Python Service
ML_SERVICE_URL=http://ml-service:8000
ML_SERVICE_API_KEY=<generated>
ML_SERVICE_TIMEOUT=5000

# Model Configuration
QUESTION_CLASSIFIER_MODEL=shahrukhx01/question-vs-statement-classifier
EMBEDDING_MODEL=BAAI/bge-m3
LLM_API_URL=https://openrouter.ai/api/v1
LLM_MODEL=google/gemini-2.0-flash-001
LLM_API_KEY=<user-provided>

# Clustering Configuration
SIMILARITY_THRESHOLD=0.85  # Configurable via environment
CONTEXT_WINDOW_SIZE=5       # Messages to check for context
BATCH_PROCESSING_SIZE=100
MESSAGE_AGE_MIN_DAYS=7     # Process messages older than this
MESSAGE_AGE_MAX_DAYS=30    # Process messages newer than this
```

### Testing Strategy

Testing will focus on validating the ML pipeline integration and clustering accuracy. Key areas include mocking external services, validating vector calculations, and ensuring proper message processing through the pipeline.

### Rollout Plan

**Phase 1: Infrastructure (Week 1)**
- Deploy Python ML service container with 4GB RAM
- Add database migrations for vector tables
- Implement basic health check endpoints
- Verify service communication

**Phase 2: Core Processing (Week 2)**
- Implement question classification with HuggingFace model
- Add BGE-M3 embedding generation
- Integrate Gemini Flash for rephrasing
- Create clustering logic with 0.85 threshold

**Phase 3: Integration (Week 3)**
- Add analysis worker with rolling window processing
- Implement admin API endpoints with authentication
- Add public question cluster endpoints
- Process initial 30-7 day window of messages

**Phase 4: Monitoring & Optimization (Week 4)**
- Add metrics collection
- Optimize batch processing
- Fine-tune similarity threshold
- Document API usage

**Feature Flags**
```typescript
FEATURE_QUESTION_ANALYSIS=false  // Enable processing
FEATURE_ML_SERVICE=false        // Use ML classification
FEATURE_AUTO_CLUSTER=false      // Auto-cluster questions
```

**Rollback Strategy**
- Feature flags disable processing immediately
- ML service failures fall back to queue retry
- Database changes are backward compatible
- Processing can resume from last checkpoint