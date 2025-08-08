# Design: Discord Question Analysis & Clustering System

## Layer 1: Problem & Requirements

### Problem Statement
Community managers need to understand the most common questions asked in Discord to improve documentation and support, but manually reviewing 250k+ messages monthly is impractical. Full LLM analysis would cost $10-50 per run, making it economically unfeasible for regular analysis.

### Current Situation (AS-IS)
- Discord messages are synced to PostgreSQL database via existing sync workers
- ~250k messages stored for the Takaro tenant
- No automated question extraction or analysis capabilities
- No historical tracking of question trends
- Manual review is the only current option

### Stakeholders
- **Primary**: Community managers who need monthly question reports
- **Secondary**: Support team using data for FAQ creation
- **Technical**: DevOps team maintaining the analysis system

### Goals
- Automate monthly question analysis for previous month's data
- Group similar questions to identify patterns
- Store results for historical trend analysis
- Keep processing costs under $5 per run

### Non-Goals
- Real-time question detection
- Processing current month's incomplete data
- Training custom ML models
- Processing attachments or media

### Constraints
- Must use CPU-only processing for bulk operations
- Budget limit of $5 per monthly run
- Must complete within 1 hour
- Must integrate with existing TypeScript/Node.js backend

### Requirements
(Referencing requirements.md REQ-001 through REQ-030, NFR-001 through NFR-018)

## Layer 2: Functional Specification

### Overview
The system uses a microservice architecture with Node.js orchestration and Python ML computation. BullMQ in the Node.js backend handles scheduling and job management, while a dedicated Python service performs question extraction and clustering. Results are stored in PostgreSQL and included in the static JSON export for frontend display.

### Architecture Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Node.js Backend                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   BullMQ     │  │  PostgreSQL  │  │   Export     │      │
│  │  Scheduler   │  │   Storage    │  │   Service    │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │              │
│  ┌──────▼──────────────────▼──────────────────▼───────┐     │
│  │         Question Analysis Worker                    │     │
│  │         - Fetches messages                          │     │
│  │         - Calls Python service                      │     │
│  │         - Stores results                            │     │
│  └─────────────────────┬───────────────────────────────┘     │
└────────────────────────┼─────────────────────────────────────┘
                         │ HTTP
┌────────────────────────▼─────────────────────────────────────┐
│                  Python Data Science Service                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   FastAPI    │  │   Question   │  │   Question   │      │
│  │   Endpoints  │  │  Classifier  │  │  Clustering  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  ┌────────────────────────────────────────────────────┐     │
│  │              ML Models (Cached)                    │     │
│  │  - shahrukhx01/question-vs-statement-classifier    │     │
│  │  - sentence-transformers/all-MiniLM-L6-v2          │     │
│  └────────────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────────────┘
```

### User Workflows

1. **Automated Monthly Analysis**
   - BullMQ cron job triggers on 1st of each month at 2 AM
   - Node.js worker fetches all active tenants
   - For each tenant:
     - Queries previous month's messages for that tenant
     - Sends messages to Python service for classification
     - Sends questions to Python service for clustering
     - Stores results in PostgreSQL with tenant_id
   - Sends completion notification with per-tenant summary

2. **Manual Analysis Trigger**
   - Admin runs: `npm run analyze:questions` (all tenants)
   - Or: `npm run analyze:questions -- --tenant=takaro` (specific tenant)
   - Creates BullMQ job with analysis parameters
   - Same per-tenant flow as automated analysis
   - Displays progress: "Processing tenant 2 of 5: Takaro"
   - Outputs summary with results per tenant

3. **Static Export Generation**
   - Export process runs: `npm run export:tenant -- --tenant=takaro`
   - Reads question clusters from PostgreSQL for that specific tenant
   - Generates questions.json alongside metadata.json
   - Includes only that tenant's historical analysis data
   - Sets hasQuestionAnalysis flag in metadata if data exists

4. **Frontend Insights Viewing**
   - User navigates to static site
   - Clicks "Insights" tab (visible when questions.json exists)
   - Selects month from dropdown
   - Views clustered questions with samples
   - No API calls required (fully static)

### Service Communication

#### Node.js → Python Service API Calls
```
POST /api/v1/questions/classify
Request: { messages: [{ id, content }] }
Response: { classifications: [{ id, is_question, confidence }] }

POST /api/v1/questions/cluster
Request: { questions: [{ id, content }] }
Response: { clusters: [{ cluster_id, members, representative }] }

POST /api/v1/clusters/label (optional)
Request: { clusters: [{ id, representative, samples }] }
Response: { labels: [{ cluster_id, label }] }
```

### Alternatives Considered

1. **Python Subprocess from Node.js**
   - **Pros**: Simpler deployment, no network overhead
   - **Cons**: Difficult dependency management, no hot-reload, harder to scale
   - **Why not chosen**: Microservice provides better separation and scalability

2. **Pure Python Implementation with Celery**
   - **Pros**: Native Python scheduling, better for ML workflows
   - **Cons**: Duplicates scheduling logic, requires separate infrastructure
   - **Why not chosen**: BullMQ already handles scheduling well

3. **Serverless Functions**
   - **Pros**: No infrastructure management, auto-scaling
   - **Cons**: Cold starts, model loading overhead, complex local development
   - **Why not chosen**: Consistent performance needed for large datasets

### Why This Solution
- Leverages existing BullMQ infrastructure for scheduling
- Separates concerns: orchestration vs computation
- Enables independent scaling of ML workloads
- Maintains single source of truth for business logic
- Provides excellent development experience with hot-reload

## Layer 3: Technical Specification

### Architecture Overview

```
verta/
├── backend/                        # Existing Node.js backend
│   ├── src/
│   │   ├── workers/
│   │   │   └── questionAnalysisWorker.ts  [EXTEND]
│   │   ├── services/
│   │   │   ├── DataScienceClient.ts  [NEW]
│   │   │   └── dataExport/
│   │   │       └── DataExportServiceImpl.ts  [EXTEND]
│   └── package.json  [EXTEND]
│
├── data-science/                   # NEW Python microservice
│   ├── Dockerfile
│   ├── Dockerfile.dev
│   ├── pyproject.toml
│   ├── uv.lock
│   ├── src/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── router.py
│   │   │   └── endpoints/
│   │   │       ├── health.py
│   │   │       └── questions.py
│   │   ├── schemas/
│   │   │   └── questions.py
│   │   ├── ml/
│   │   │   ├── __init__.py
│   │   │   ├── classifier.py
│   │   │   ├── clustering.py
│   │   │   └── embeddings.py
│   │   └── utils/
│   │       └── model_cache.py
│   └── tests/
│
├── frontend/                       # Existing frontend
│   ├── pages/
│   │   └── insights.tsx  [NEW]
│   ├── components/
│   │   ├── Layout.tsx  [EXTEND]
│   │   └── insights/
│   │       ├── QuestionClusters.tsx  [NEW]
│   │       └── MonthSelector.tsx  [NEW]
│   └── lib/
│       └── data.ts  [EXTEND]
│
└── docker-compose.yml  [EXTEND]
```

### Extension vs Creation Analysis

| Component | Extend/Create | Justification |
|-----------|---------------|---------------|
| BullMQ Workers | Extend | Use existing worker pattern and scheduling |
| Database | Extend | Add new tables via Kysely migration |
| Export Service | Extend | Add question export to existing service |
| Docker Compose | Extend | Add data-science service configuration |
| Python Service | Create | New microservice for ML computation |
| Frontend Components | Create | New Insights tab and components |
| Data Library | Extend | Add question data loading functions |

### Components

#### Node.js Backend Extensions

**DataScienceClient** (`backend/src/services/DataScienceClient.ts`)
```typescript
export class DataScienceClient {
  private baseUrl: string;
  private timeout: number;

  constructor() {
    this.baseUrl = process.env.DATA_SCIENCE_URL || 'http://data-science:8000';
    this.timeout = 30000; // 30 seconds
  }

  async classifyQuestions(messages: Message[]): Promise<Classification[]> {
    const response = await fetch(`${this.baseUrl}/api/v1/questions/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        messages: messages.map(m => ({
          id: m.id,
          content: m.content
        }))
      }),
      signal: AbortSignal.timeout(this.timeout)
    });
    
    if (!response.ok) {
      throw new Error(`Classification failed: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.classifications;
  }

  async clusterQuestions(questions: Question[]): Promise<Cluster[]> {
    const response = await fetch(`${this.baseUrl}/api/v1/questions/cluster`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions }),
      signal: AbortSignal.timeout(this.timeout)
    });
    
    if (!response.ok) {
      throw new Error(`Clustering failed: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.clusters;
  }
}
```

**Question Analysis Worker Extension**
```typescript
// backend/src/workers/questionAnalysisWorker.ts
export class QuestionAnalysisWorker {
  private dataScienceClient: DataScienceClient;

  constructor(
    private readonly db: Database,
    private readonly logger: Logger
  ) {
    this.dataScienceClient = new DataScienceClient();
  }

  async process(job: Job<QuestionAnalysisJobData>) {
    const { specificTenantId, analysisMonth } = job.data;
    
    // Get tenants to process
    const tenants = specificTenantId 
      ? await this.getTenantById(specificTenantId)
      : await this.getAllActiveTenants();
    
    const results = [];
    
    for (let i = 0; i < tenants.length; i++) {
      const tenant = tenants[i];
      
      // Update progress
      await job.updateProgress({
        current: i + 1,
        total: tenants.length,
        tenantName: tenant.name
      });
      
      try {
        // Fetch messages for this tenant from previous month
        const messages = await this.fetchPreviousMonthMessages(
          tenant.id, 
          analysisMonth
        );
        
        if (messages.length === 0) {
          this.logger.info(`No messages for tenant ${tenant.name}`);
          continue;
        }
        
        // Classify messages using Python service
        const classifications = await this.dataScienceClient.classifyQuestions(messages);
        
        // Filter questions
        const questions = classifications
          .filter(c => c.is_question)
          .map(c => messages.find(m => m.id === c.id));
        
        // Cluster questions using Python service
        const clusters = await this.dataScienceClient.clusterQuestions(questions);
        
        // Store results in PostgreSQL with tenant_id
        await this.storeClusters(tenant.id, analysisMonth, clusters);
        
        results.push({
          tenantId: tenant.id,
          tenantName: tenant.name,
          questionsFound: questions.length,
          clustersCreated: clusters.length
        });
        
      } catch (error) {
        this.logger.error(`Failed to process tenant ${tenant.name}:`, error);
        results.push({
          tenantId: tenant.id,
          tenantName: tenant.name,
          error: error.message
        });
        // Continue with next tenant
      }
    }
    
    return { 
      tenantsProcessed: results.length,
      results 
    };
  }
}
```

#### Python Data Science Service

**Project Configuration** (`data-science/pyproject.toml`)
```toml
[project]
name = "verta-data-science"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi[standard]>=0.115.0",
    "pydantic>=2.9.0",
    "transformers>=4.36.0",
    "sentence-transformers>=2.2.0",
    "torch>=2.1.0",
    "scipy>=1.11.0",  # For hierarchical clustering
    "numpy>=1.24.0",
    "scikit-learn>=1.3.0",
    "openai>=1.0.0",  # OpenRouter uses OpenAI-compatible API
    "httpx>=0.27.0",  # For fallback direct API calls
    "asyncio>=3.4.3",
]

[dependency-groups]
dev = [
    "pytest>=8.0.0",
    "pytest-asyncio>=0.23.0",
    "black>=24.0.0",
    "ruff>=0.8.0",
    "mypy>=1.13.0",
    "ipython>=8.0.0",
]

[tool.ruff]
line-length = 100
target-version = "py312"

[tool.black]
line-length = 100
target-version = ["py312"]
```

**FastAPI Application** (`data-science/src/main.py`)
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from src.api.router import api_router
from src.config import settings
from src.ml import preload_models

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: preload ML models
    await preload_models()
    yield
    # Shutdown: cleanup if needed

app = FastAPI(
    title="Verta Data Science Service",
    version="0.1.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:25000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")
```

**ML Pipeline** (`data-science/src/ml/classifier.py`)
```python
from transformers import pipeline
from typing import List, Dict
import torch

class QuestionClassifier:
    def __init__(self):
        self.device = 0 if torch.cuda.is_available() else -1
        self.classifier = pipeline(
            "text-classification",
            model="shahrukhx01/question-vs-statement-classifier",
            device=self.device
        )
    
    def classify_batch(
        self, 
        messages: List[Dict], 
        batch_size: int = 32
    ) -> List[Dict]:
        texts = [msg["content"] for msg in messages]
        results = self.classifier(texts, batch_size=batch_size)
        
        return [
            {
                "id": msg["id"],
                "is_question": result["label"] == "QUESTION",
                "confidence": result["score"]
            }
            for msg, result in zip(messages, results)
        ]
```

**Clustering Implementation** (`data-science/src/ml/clustering.py`)
```python
from sentence_transformers import SentenceTransformer
from scipy.cluster.hierarchy import fcluster, linkage
import numpy as np
from typing import List, Dict

class QuestionClusterer:
    def __init__(self):
        self.encoder = SentenceTransformer('all-MiniLM-L6-v2')
        
    def cluster(self, questions: List[Dict], distance_threshold: float = 0.5) -> List[Dict]:
        if len(questions) < 3:
            return []
        
        # Generate embeddings
        texts = [q["extracted_question"] for q in questions]
        embeddings = self.encoder.encode(texts, batch_size=32)
        
        # Hierarchical clustering
        linkage_matrix = linkage(embeddings, method='average', metric='cosine')
        cluster_labels = fcluster(linkage_matrix, distance_threshold, criterion='distance')
        
        # Group by cluster
        clusters = {}
        for idx, label in enumerate(cluster_labels):
            if label not in clusters:
                clusters[label] = {
                    "cluster_id": int(label),
                    "members": [],
                    "embeddings": []
                }
            clusters[label]["members"].append(questions[idx])
            clusters[label]["embeddings"].append(embeddings[idx])
        
        # Find representatives
        result = []
        for cluster_data in clusters.values():
            # Find centroid
            centroid = np.mean(cluster_data["embeddings"], axis=0)
            distances = [np.linalg.norm(emb - centroid) for emb in cluster_data["embeddings"]]
            rep_idx = np.argmin(distances)
            
            result.append({
                "cluster_id": cluster_data["cluster_id"],
                "representative": cluster_data["members"][rep_idx]["extracted_question"],
                "size": len(cluster_data["members"]),
                "samples": [m["extracted_question"] for m in cluster_data["members"][:5]]
            })
        
        return sorted(result, key=lambda x: x["size"], reverse=True)
```

### Detailed ML Processing Pipeline

This section provides a comprehensive explanation of HOW the message classification and clustering actually works, with concrete examples and implementation details.

#### Complete Processing Flow

```
1. QUESTION FILTERING (Python)
   250k messages → 25k potential questions
   ↓
2. CONTEXT EXTRACTION (LLM)
   Get ±2min context, extract complete question
   ↓
3. DEDUPLICATION (Python)
   25k → ~5k unique questions
   ↓
4. HIERARCHICAL CLUSTERING (Python)
   Group into ~50-100 clusters
   ↓
5. STORAGE (Node.js → PostgreSQL)
   Store clusters with samples
```

#### Step 1: Question Classification (First-Pass Filter)

The question classifier serves as a cheap filter to identify potential questions, reducing LLM costs by ~90%:

```python
def filter_potential_questions(messages):
    """
    Use BERT classifier to filter obvious non-questions.
    This reduces 250k messages to ~25k potential questions.
    """
    classifier = pipeline(
        "text-classification",
        model="shahrukhx01/question-vs-statement-classifier"
    )
    
    # Batch classify for efficiency
    results = classifier(
        [msg.content for msg in messages],
        batch_size=32
    )
    
    # Keep only likely questions (>0.7 confidence)
    potential_questions = [
        msg for msg, result in zip(messages, results)
        if result["label"] == "QUESTION" and result["score"] > 0.7
    ]
    
    return potential_questions  # ~10% of original messages
```

**Why Keep the Classifier?**
- Processes 100 msgs/sec (vs 10 questions/sec for LLM)
- Costs $0 (vs $0.075 per 1M tokens for LLM)
- Reduces LLM load by 90%
- Simple and fast first-pass filter

#### Step 2: LLM Context Extraction

For each potential question, get context and extract the complete question:

```python
async def extract_complete_question(question_msg, all_messages):
    # Get ±2 minute context from same author
    context = get_context_window(
        all_messages,
        author_id=question_msg.author_id,
        timestamp=question_msg.timestamp,
        window_seconds=120
    )
    
    # Use LLM to extract complete question with context
    prompt = f"""Extract the complete question from these Discord messages.
Include all relevant context, error messages, and code.

Messages: {format_messages(context)}

Output only the complete question."""
    
    extracted = await gemini_flash.generate(prompt, temperature=0.1)
    
    return {
        'original_id': question_msg.id,
        'extracted_question': extracted,
        'context_ids': [m.id for m in context]
    }
```

#### Step 3: Semantic Embedding Generation

The `sentence-transformers/all-MiniLM-L6-v2` model creates semantic embeddings:

**Process:**
1. **Tokenization**: Convert to BERT tokens (max 256 tokens)
2. **Encoding**: Pass through 6 transformer layers
3. **Pooling**: Mean pooling of token embeddings
4. **Normalization**: L2 normalization to unit vectors

**Example Embeddings (simplified visualization):**
```python
# Similar questions will have high cosine similarity (>0.8)
q1 = "How do I add a server?"
q2 = "What's the process to connect a server?"
# cosine_similarity(embed(q1), embed(q2)) ≈ 0.85

q3 = "Server connection tutorial?"
q4 = "Guide for linking servers"
# cosine_similarity(embed(q3), embed(q4)) ≈ 0.82

# Different topics have low similarity (<0.5)
q5 = "How to ban users?"
q6 = "What's the weather today?"
# cosine_similarity(embed(q5), embed(q6)) ≈ 0.2
```

**Actual Embedding Dimensions:**
- Output: 384-dimensional dense vector
- Range: [-1, 1] per dimension after normalization
- Storage: ~1.5KB per embedding

#### Step 4: Hierarchical Clustering

After deduplication, use hierarchical clustering to group similar questions:

```python
from scipy.cluster.hierarchy import fcluster, linkage

def cluster_questions(unique_questions):
    """
    Simple hierarchical clustering for question grouping.
    """
    # Generate embeddings
    texts = [q['extracted_question'] for q in unique_questions]
    embeddings = encoder.encode(texts, batch_size=32)
    
    # Compute hierarchical clustering
    linkage_matrix = linkage(embeddings, method='average', metric='cosine')
    
    # Cut tree at distance threshold
    cluster_labels = fcluster(linkage_matrix, 0.5, criterion='distance')
    
    # Group questions by cluster
    clusters = {}
    for idx, label in enumerate(cluster_labels):
        if label not in clusters:
            clusters[label] = []
        clusters[label].append(unique_questions[idx])
    
    return clusters
```

**Example Clustering Result:**
```python
{
    "cluster_1": {  # Server connection issues
        "size": 142,
        "representative": "How do I fix ECONNREFUSED error on port 3000?",
        "samples": [
            "Connection refused on port 3000, was working yesterday",
            "Server won't connect, getting timeout error", 
            "Can't link game server, connection fails"
        ]
    },
    "cluster_2": {  # Permission problems  
        "size": 89,
        "representative": "How do I set up admin permissions and roles?",
        "samples": [
            "Admin commands not working, how to fix permissions?",
            "Can't assign roles to users, permission denied",
            "How do moderator roles and permissions work?"
        ]
    },
    "cluster_3": {  # Installation questions
        "size": 67,
        "representative": "How do I install the bot on Ubuntu with Docker?",
        "samples": [
            "Installation guide for Windows 10 with Node 18?",
            "Setup failed during npm install, what now?",
            "Do I need Docker for installation?"
        ]
    }
}
```

#### Step 5: Representative Selection

For each cluster, we select the most representative question:

```python
def select_representative(cluster_embeddings, cluster_questions):
    # Calculate cluster centroid (mean of all embeddings)
    centroid = np.mean(cluster_embeddings, axis=0)
    
    # Find question closest to centroid
    distances = [
        np.linalg.norm(emb - centroid) 
        for emb in cluster_embeddings
    ]
    
    # Select minimum distance
    representative_idx = np.argmin(distances)
    
    return cluster_questions[representative_idx]
```

**Example:**
```
Cluster: Server Connection Issues (142 questions)
Centroid: [0.23, -0.45, 0.12, ...] (384 dimensions)

Distances from centroid:
- "How do I connect my server?" → 0.12 (SELECTED)
- "Server won't connect, help?" → 0.18
- "Connection timeout when adding server" → 0.21
- "HELP SERVER BROKEN!!!" → 0.45
```

#### Complete Data Flow Example

**Input Message:**
```
"hey guys, how do I add my minecraft server to the bot? I tried the !add command but it's not working"
```

**Processing Steps:**

1. **Preprocessing:**
   ```
   "hey guys, how do I add my minecraft server to the bot? I tried the !add command but it's not working"
   ```

2. **Classification:**
   ```json
   {
     "is_question": true,
     "confidence": 0.91,
     "processing_time_ms": 12
   }
   ```

3. **Embedding Generation:**
   ```json
   {
     "embedding": [0.234, -0.123, 0.456, ...],
     "dimensions": 384,
     "processing_time_ms": 8
   }
   ```

4. **Clustering Assignment:**
   ```json
   {
     "cluster_id": 0,
     "cluster_name": "Server Connection Issues",
     "distance_to_centroid": 0.15,
     "cluster_size": 142
   }
   ```

5. **Storage Record:**
   ```sql
   INSERT INTO question_classifications (
     message_id, is_question, confidence, cluster_id
   ) VALUES (
     'uuid-123', true, 0.91, 0
   );
   ```

#### Performance Characteristics

**Bottlenecks and Optimizations:**

1. **Classification Bottleneck**: Model loading
   - Solution: Preload models on startup
   - Impact: 10s startup vs 10s per request

2. **Embedding Bottleneck**: Sequential processing
   - Solution: Batch processing (32 messages)
   - Impact: 50 msgs/sec → 200 msgs/sec

3. **Clustering Bottleneck**: Memory for distance matrix
   - Solution: Mini-batch clustering for >50k questions
   - Impact: 8GB → 2GB memory usage

4. **Storage Bottleneck**: Individual inserts
   - Solution: Bulk inserts with ON CONFLICT
   - Impact: 10 inserts/sec → 1000 inserts/sec

**Memory Usage Profile:**
```
Models loaded: ~500MB
Per 1000 messages:
- Text data: ~2MB
- Embeddings: ~1.5MB
- Distance matrix: ~4MB
- Clusters: ~0.5MB
Total: ~8MB per 1000 messages

For 250k messages: ~2GB peak memory
```

#### Edge Cases and Error Handling

With the LLM handling context extraction, most edge cases are automatically resolved:

**1. Handled by LLM:**
- Very short messages ("help") - LLM adds context
- Code snippets - LLM understands code in context
- Multi-language content - LLM is multilingual
- Split messages - LLM combines from context window

**2. Remaining Edge Cases:**
```python
def handle_edge_cases(questions):
    # Too few questions to cluster
    if len(questions) < 3:
        return questions  # Return as individual items
    
    # LLM extraction failed
    if not extracted_question:
        # Fall back to original message
        return original_message
    
    # Memory constraints
    if len(questions) > 50000:
        # Process in batches
        return batch_process(questions, batch_size=10000)
```

### LLM-Enhanced Context Extraction

Discord users frequently split their questions across multiple messages. Instead of trying to detect patterns, we use an LLM to intelligently extract complete questions with their full context.

#### The Multi-Message Problem

Users commonly split questions across messages:
- **"Can someone help with this?"** → [error message] → "I tried restarting"
- [code snippet] → **"Why doesn't this work?"**
- **"How do I install?"** → "I'm on Ubuntu" → "Using Node 18"

Traditional single-message classification misses crucial context. Our solution: Use the question classifier to find questions, then use an LLM to extract the complete question with surrounding context.

#### Simplified Processing Pipeline

```python
async def process_questions(messages: List[Message]):
    """
    Simple 5-step pipeline for question analysis.
    """
    
    # Step 1: Filter potential questions (reduces 250k → 25k)
    potential_questions = filter_with_classifier(messages)
    
    # Step 2: Extract complete questions with LLM
    extracted_questions = []
    for q in potential_questions:
        context = get_context_window(messages, q.author_id, q.timestamp)
        extracted = await extract_with_llm(q, context)
        extracted_questions.append(extracted)
    
    # Step 3: Deduplicate (25k → ~5k unique)
    unique_questions = deduplicate_questions(extracted_questions, threshold=0.95)
    
    # Step 4: Cluster similar questions
    clusters = hierarchical_cluster(unique_questions, distance=0.5)
    
    # Step 5: Store results
    await store_clusters(clusters)
    
    return clusters

def get_context_window(messages, author_id, center_time, window_seconds):
    """Get messages from same author within time window."""
    start_time = center_time - timedelta(seconds=window_seconds)
    end_time = center_time + timedelta(seconds=window_seconds)
    
    return [
        msg for msg in messages
        if msg.author_id == author_id
        and start_time <= msg.timestamp <= end_time
    ]
```

#### LLM Integration via OpenRouter

**OpenRouter Configuration:**
```python
from openai import AsyncOpenAI
import os

class OpenRouterClient:
    """Client for accessing multiple LLMs through OpenRouter."""
    
    def __init__(self, model: str = "google/gemini-2.0-flash-exp"):
        self.client = AsyncOpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.getenv("OPENROUTER_API_KEY"),
            default_headers={
                "HTTP-Referer": "https://verta.app",  # Optional
                "X-Title": "Verta Question Analysis"   # Optional
            }
        )
        self.model = model
    
    async def extract_question(self, context_messages: List[str]) -> str:
        """Extract complete question from message context."""
        
        prompt = f"""Extract the complete question from these Discord messages.
Include all relevant context, error messages, code snippets, and system details.
If there are multiple related questions, combine them into one clear question.

Messages from user:
{chr(10).join(context_messages)}

Output only the extracted question with full context, nothing else."""
        
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=500,
            temperature=0.1  # Low temperature for consistency
        )
        
        return response.choices[0].message.content
```

**Available Models via OpenRouter:**
```python
# Cost-optimized models (prices per 1M tokens)
MODELS = {
    "google/gemini-2.0-flash-exp": 0.00,   # FREE experimental model!
    "google/gemini-flash-1.5": 0.075,      # Stable, good quality
    "google/gemini-flash-1.5-8b": 0.0375,  # Even cheaper, smaller
    "meta-llama/llama-3.1-8b-instruct": 0.06,  # Open source alternative
    "anthropic/claude-3-haiku": 0.25,      # Fast and reliable
    "openai/gpt-4o-mini": 0.15,            # Good balance
    "anthropic/claude-3.5-sonnet": 3.00,   # Best quality (use sparingly)
}

# Easy model switching via environment variable
model = os.getenv("LLM_MODEL", "google/gemini-2.0-flash-exp")
client = OpenRouterClient(model=model)
```

**Question Extraction Implementation:**
```python
async def extract_with_llm(question_msg: Message, context: List[Message]):
    # Initialize client with configured model
    client = OpenRouterClient(model=os.getenv("LLM_MODEL"))
    
    # Prepare context
    context_messages = [
        f"[{msg.timestamp.strftime('%H:%M:%S')}] {msg.content}"
        for msg in sorted(context, key=lambda m: m.timestamp)
    ]
    
    try:
        # Extract question via OpenRouter
        extracted = await client.extract_question(context_messages)
        
        return {
            'original_id': question_msg.id,
            'original_content': question_msg.content,
            'extracted_question': extracted,
            'context_message_ids': [m.id for m in context],
            'model_used': client.model
        }
    except Exception as e:
        # Fallback to original message if extraction fails
        logger.error(f"LLM extraction failed: {e}")
        return {
            'original_id': question_msg.id,
            'original_content': question_msg.content,
            'extracted_question': question_msg.content,
            'context_message_ids': [question_msg.id],
            'model_used': 'fallback'
        }
```

**Batch Processing for Efficiency:**
```python
async def batch_extract_questions(questions_with_context, batch_size=20):
    """Process multiple questions in parallel for efficiency."""
    batches = [
        questions_with_context[i:i + batch_size]
        for i in range(0, len(questions_with_context), batch_size)
    ]
    
    results = []
    for batch in batches:
        # Parallel LLM calls
        batch_results = await asyncio.gather(*[
            extract_with_llm(q['question'], q['context'])
            for q in batch
        ])
        results.extend(batch_results)
        
        # Rate limiting
        await asyncio.sleep(0.5)
    
    return results
```

#### Deduplication Before Clustering

LLM extraction often standardizes similar questions, making deduplication crucial:

```python
def deduplicate_questions(extracted_questions, similarity_threshold=0.95):
    """Remove near-duplicate questions before clustering."""
    
    # Generate embeddings
    embeddings = encoder.encode([
        q['extracted_question'] for q in extracted_questions
    ])
    
    # Build similarity matrix
    similarity_matrix = cosine_similarity(embeddings)
    
    # Find duplicates
    unique_indices = []
    seen = set()
    
    for i in range(len(extracted_questions)):
        if i in seen:
            continue
            
        # Find all similar questions
        similar = np.where(similarity_matrix[i] > similarity_threshold)[0]
        
        # Keep the one with highest extraction confidence
        best_idx = max(similar, key=lambda x: 
                      extracted_questions[x]['extraction_confidence'])
        
        unique_indices.append(best_idx)
        seen.update(similar)
    
    # Return unique questions with duplicate mappings
    unique_questions = []
    for idx in unique_indices:
        question = extracted_questions[idx].copy()
        # Add IDs of all duplicates
        question['duplicate_ids'] = [
            extracted_questions[j]['original_id']
            for j in range(len(extracted_questions))
            if similarity_matrix[idx][j] > similarity_threshold
        ]
        unique_questions.append(question)
    
    return unique_questions
```

#### Hierarchical Clustering Approach

After LLM extraction and deduplication, use hierarchical clustering for better insights:

```python
from scipy.cluster.hierarchy import dendrogram, fcluster, linkage

def perform_hierarchical_clustering(unique_questions, distance_threshold=0.5):
    """
    Hierarchical clustering provides multiple levels of granularity.
    """
    if len(unique_questions) < 3:
        return []
    
    # Generate embeddings for unique questions
    texts = [q['extracted_question'] for q in unique_questions]
    embeddings = encoder.encode(texts, batch_size=32)
    
    # Compute linkage matrix
    linkage_matrix = linkage(
        embeddings,
        method='average',  # UPGMA
        metric='cosine'
    )
    
    # Cut dendrogram at specified distance
    cluster_labels = fcluster(
        linkage_matrix,
        distance_threshold,
        criterion='distance'
    )
    
    # Organize into clusters
    clusters = {}
    for idx, label in enumerate(cluster_labels):
        if label not in clusters:
            clusters[label] = {
                'cluster_id': int(label),
                'questions': [],
                'embeddings': []
            }
        clusters[label]['questions'].append(unique_questions[idx])
        clusters[label]['embeddings'].append(embeddings[idx])
    
    # Process each cluster
    result = []
    for cluster_data in clusters.values():
        # Find representative (closest to centroid)
        centroid = np.mean(cluster_data['embeddings'], axis=0)
        distances = [
            np.linalg.norm(emb - centroid)
            for emb in cluster_data['embeddings']
        ]
        rep_idx = np.argmin(distances)
        
        cluster_info = {
            'cluster_id': cluster_data['cluster_id'],
            'size': len(cluster_data['questions']),
            'representative': cluster_data['questions'][rep_idx]['extracted_question'],
            'samples': [q['extracted_question'] for q in cluster_data['questions'][:5]],
            'all_original_ids': [
                id for q in cluster_data['questions']
                for id in q['duplicate_ids']
            ]
        }
        
        # Optional: Generate cluster label with LLM
        if cluster_info['size'] >= 5:
            cluster_info['label'] = await generate_cluster_label(
                cluster_info['samples'][:3]
            )
        
        result.append(cluster_info)
    
    return sorted(result, key=lambda x: x['size'], reverse=True)
```

#### Two-Stage Clustering (Optional)

For very large datasets, consider two-stage clustering:

```python
def two_stage_clustering(unique_questions):
    """
    Stage 1: Major topics (min_size=30)
    Stage 2: Subtopics within each major topic (min_size=5)
    """
    
    # Stage 1: Find major topics
    major_clusters = perform_hierarchical_clustering(
        unique_questions,
        distance_threshold=0.7  # Broader grouping
    )
    
    # Stage 2: Sub-cluster each major topic
    final_clusters = []
    for major in major_clusters:
        if major['size'] > 50:  # Only sub-cluster large groups
            sub_clusters = perform_hierarchical_clustering(
                major['questions'],
                distance_threshold=0.4  # Finer grouping
            )
            # Add parent reference
            for sub in sub_clusters:
                sub['parent_topic'] = major['label']
            final_clusters.extend(sub_clusters)
        else:
            final_clusters.append(major)
    
    return final_clusters
```

#### Example Transformations

**Example 1: Split Question with Error**

*Original Messages:*
```
[12:01:23] User123: "Can anyone help with this?"
[12:01:25] User123: "Error: ECONNREFUSED 127.0.0.1:3000"
[12:01:30] User123: "It was working yesterday"
```

*After LLM Extraction:*
```json
{
  "original_id": "msg1",
  "original_content": "Can anyone help with this?",
  "extracted_question": "I'm getting an ECONNREFUSED error on port 3000 that started today - it was working yesterday. How can I fix this connection refused error?",
  "context_message_ids": ["msg1", "msg2", "msg3"],
  "extraction_confidence": 0.92
}
```

**Example 2: Code-First Pattern**

*Original Messages:*
```
[14:22:10] DevUser: "```js\nconst server = new Server();\nserver.start();\n```"
[14:22:15] DevUser: "Why does this throw an error?"
```

*After LLM Extraction:*
```json
{
  "original_id": "msg5",
  "original_content": "Why does this throw an error?",
  "extracted_question": "Why does creating a new Server() instance and calling server.start() throw an error in JavaScript?",
  "context_message_ids": ["msg4", "msg5"],
  "extraction_confidence": 0.95
}
```

**Example 3: Multi-Part Question**

*Original Messages:*
```
[09:15:00] NewUser: "Hi, I need help with a few things"
[09:15:05] NewUser: "First, how do I install this on Ubuntu?"
[09:15:10] NewUser: "Second, what ports need to be open?"
[09:15:12] NewUser: "And do I need Docker?"
```

*After LLM Extraction:*
```json
{
  "original_id": "msg7",
  "original_content": "First, how do I install this on Ubuntu?",
  "extracted_question": "How do I install this application on Ubuntu, what ports need to be open for it to work, and is Docker required for the installation?",
  "context_message_ids": ["msg6", "msg7", "msg8", "msg9"],
  "extraction_confidence": 0.98
}
```

#### Cost Analysis

**LLM Token Usage:**
- Average context window: 5 messages × 50 tokens = 250 tokens
- Prompt overhead: 100 tokens
- Total per question: ~350 input tokens
- Output: ~100 tokens per extraction

**Cost Calculation for 250k Messages:**
```python
# Assumptions
total_messages = 250_000
question_rate = 0.10  # 10% are questions
questions = 25_000

# Token usage
tokens_per_question = 350 + 100  # input + output
total_tokens = questions * tokens_per_question
total_tokens = 11_250_000  # 11.25M tokens

# Cost with different OpenRouter models (per 1M tokens)
costs = {
    "google/gemini-2.0-flash-exp": 11.25 * 0.00,   # $0.00 - FREE!
    "google/gemini-flash-1.5-8b": 11.25 * 0.0375,  # $0.42
    "meta-llama/llama-3.1-8b": 11.25 * 0.06,       # $0.68
    "google/gemini-flash-1.5": 11.25 * 0.075,      # $0.84
    "openai/gpt-4o-mini": 11.25 * 0.15,            # $1.69
    "anthropic/claude-3-haiku": 11.25 * 0.25,      # $2.81
}

# Recommended: google/gemini-2.0-flash-exp for $0.00 (while free!)
# Stable fallback: google/gemini-flash-1.5 for $0.84

# Optional cluster labeling (50 clusters × 500 tokens)
labeling_tokens = 25_000
labeling_cost = 0.025 * 0.075  # $0.002

# Total with recommended model: ~$0.85 (well under $5 budget)
```

**Model Selection Strategy:**
```python
# Use free experimental model while available!
EXTRACTION_MODEL = "google/gemini-2.0-flash-exp"  # $0.00 for 25k questions!

# Fallback to stable model if experimental fails
FALLBACK_MODEL = "google/gemini-flash-1.5"        # $0.84 for 25k questions

# Use better models for cluster labeling (optional)
LABELING_MODEL = "anthropic/claude-3-haiku"       # $0.01 for 50 labels

# Other models to experiment with
EXPERIMENTAL_MODELS = [
    "meta-llama/llama-3.1-8b-instruct",  # Open source option
    "google/gemini-flash-1.5-8b",        # Budget option
]
```

#### Storage Modifications

```sql
-- Enhanced question_clusters table
ALTER TABLE question_clusters 
ADD COLUMN extracted_question TEXT,        -- LLM-extracted full question
ADD COLUMN context_message_ids UUID[],     -- Messages used for context
ADD COLUMN duplicate_question_ids UUID[],  -- Similar questions merged
ADD COLUMN extraction_model TEXT,          -- Model used (gemini-flash-1.5)
ADD COLUMN extraction_confidence REAL;     -- Confidence in extraction

-- Enhanced question_classifications table  
ALTER TABLE question_classifications
ADD COLUMN is_context_expanded BOOLEAN DEFAULT FALSE,
ADD COLUMN llm_extraction_id UUID;         -- Link to extraction record
```

#### Performance Characteristics

**With LLM Enhancement:**
- **Question Detection**: 95% → 99% accuracy (captures full context)
- **Clustering Quality**: 60% → 85% meaningful clusters
- **Processing Time**: +40% due to LLM calls (mitigated by batching)
- **Memory Usage**: Similar (deduplication reduces final dataset)

**Optimization Strategies:**
1. **Batch Processing**: Process 20 questions per LLM call
2. **Caching**: Cache extracted questions for re-runs
3. **Parallel Processing**: Multiple LLM calls in parallel
4. **Smart Sampling**: Only use LLM for ambiguous cases (confidence 0.6-0.8)

#### Configuration

```python
# Environment variables
OPENROUTER_API_KEY = "sk-or-v1-..."      # Your OpenRouter API key
LLM_MODEL = "google/gemini-2.0-flash-exp"  # Primary model (FREE!)
LLM_FALLBACK_MODEL = "google/gemini-flash-1.5"  # Fallback if experimental fails
LLM_BATCH_SIZE = 20                      # Questions per batch
LLM_MAX_RETRIES = 3                      # Retry failed extractions
LLM_TIMEOUT_SECONDS = 30                 # Timeout per batch
CONTEXT_WINDOW_SECONDS = 120             # ±2 minutes
DEDUP_SIMILARITY_THRESHOLD = 0.95        # Near-duplicate threshold
CLUSTERING_DISTANCE_THRESHOLD = 0.5      # Hierarchical clustering cutoff
ENABLE_TWO_STAGE_CLUSTERING = False      # Use two-stage for large datasets
MIN_CLUSTER_SIZE_FOR_LABELING = 5        # Min size to generate label

# OpenRouter-specific settings
OPENROUTER_HTTP_REFERER = "https://verta.app"  # Optional, for analytics
OPENROUTER_APP_NAME = "Verta Question Analysis"  # Optional, shows in dashboard
```

### Docker Configuration

**Development Dockerfile** (`data-science/Dockerfile.dev`)
```dockerfile
FROM python:3.12-slim

# Install uv
RUN pip install uv

WORKDIR /app

# Copy dependency files
COPY pyproject.toml uv.lock ./

# Install dependencies
RUN uv sync --frozen

# Copy source code (mounted in dev)
COPY src/ ./src/

# Run with hot reload
CMD ["uv", "run", "uvicorn", "src.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"]
```

**Production Dockerfile** (`data-science/Dockerfile`)
```dockerfile
# Build stage
FROM python:3.12-slim AS builder

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/

WORKDIR /app

# Copy and install dependencies
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project

# Runtime stage
FROM python:3.12-slim

WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder /app/.venv /app/.venv

# Copy source code
COPY src/ ./src/

# Set environment variables
ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH="/app"

# Run application
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Docker Compose Extension** (`docker-compose.yml`)
```yaml
services:
  # ... existing services ...
  
  data-science:
    build:
      context: ./data-science
      dockerfile: ${DS_DOCKERFILE:-Dockerfile.dev}
    container_name: verta-data-science
    ports:
      - '25003:8000'
    volumes:
      - ./data-science:/app  # Development only
      - ml_models:/app/models  # Model cache
    environment:
      - ENVIRONMENT=${ENVIRONMENT:-development}
      - MODEL_CACHE_DIR=/app/models
      - LOG_LEVEL=info
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped
    networks:
      - verta-network
  
  app:  # Existing Node.js backend
    environment:
      - DATA_SCIENCE_URL=http://data-science:8000
    depends_on:
      - postgres
      - redis
      - data-science
    networks:
      - verta-network

networks:
  verta-network:
    driver: bridge

volumes:
  ml_models:  # Cache for ML models
```

### Data Models

```typescript
// Kysely migration for question analysis tables
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('question_clusters')
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('tenant_id', 'uuid', (col) => 
      col.notNull().references('tenants.id'))
    .addColumn('analysis_month', 'date', (col) => col.notNull())
    .addColumn('cluster_id', 'integer', (col) => col.notNull())
    .addColumn('representative_text', 'text', (col) => col.notNull())
    .addColumn('cluster_label', 'text')
    .addColumn('member_count', 'integer', (col) => col.notNull())
    .addColumn('sample_messages', 'text[]', (col) => col.notNull())
    .addColumn('message_ids', 'uuid[]')
    .addColumn('created_at', 'timestamp', (col) => 
      col.defaultTo(sql`now()`).notNull())
    .addColumn('updated_at', 'timestamp', (col) => 
      col.defaultTo(sql`now()`).notNull())
    .addUniqueConstraint('unique_cluster', 
      ['tenant_id', 'analysis_month', 'cluster_id'])
    .execute();

  await db.schema
    .createTable('question_classifications')
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('message_id', 'uuid', (col) => 
      col.notNull().references('messages.id').unique())
    .addColumn('is_question', 'boolean', (col) => col.notNull())
    .addColumn('confidence', 'real')
    .addColumn('cluster_id', 'integer')
    .addColumn('processed_at', 'timestamp', (col) => 
      col.defaultTo(sql`now()`).notNull())
    .execute();
}
```

### Testing Strategy

#### Node.js Tests
```typescript
describe('DataScienceClient', () => {
  it('handles service unavailable gracefully', async () => {
    const client = new DataScienceClient();
    // Mock fetch to simulate service down
    await expect(client.classifyQuestions([])).rejects.toThrow();
  });
  
  it('respects timeout configuration', async () => {
    const client = new DataScienceClient();
    // Mock slow response
    await expect(client.classifyQuestions(largeDataset)).rejects.toThrow('timeout');
  });
});
```

#### Python Tests
```python
import pytest
from src.ml.classifier import QuestionClassifier

@pytest.fixture
def classifier():
    return QuestionClassifier()

def test_question_classification(classifier):
    messages = [
        {"id": "1", "content": "How do I connect my server?"},
        {"id": "2", "content": "The server is now connected."}
    ]
    
    results = classifier.classify_batch(messages)
    
    assert results[0]["is_question"] == True
    assert results[1]["is_question"] == False
    assert all(0 <= r["confidence"] <= 1 for r in results)

def test_handles_empty_input(classifier):
    results = classifier.classify_batch([])
    assert results == []
```

### Performance Optimizations
- Model preloading on service startup
- Batch processing for classification and embedding
- Model caching in Docker volume
- Connection pooling for inter-service communication
- Async endpoints for non-blocking operations

### Security Considerations
- Internal network communication only
- Input validation with Pydantic
- Rate limiting on endpoints
- Health check authentication
- No direct database access from Python service

### Rollout Plan
1. Create Python service structure
2. Implement ML endpoints
3. Add DataScienceClient to Node.js
4. Update questionAnalysisWorker
5. Extend docker-compose.yml
6. Test inter-service communication
7. Run integration tests
8. Deploy with existing infrastructure
9. Monitor first automated run

## Appendix

### Python Dependencies
```txt
# Core ML libraries
transformers==4.36.0
sentence-transformers==2.2.2
torch==2.1.0  # CPU version
scipy==1.11.0  # Hierarchical clustering
numpy==1.24.0
scikit-learn==1.3.0

# LLM Integration
openai==1.0.0  # OpenRouter uses OpenAI-compatible API

# API framework
fastapi==0.115.0
uvicorn[standard]==0.32.0
pydantic==2.9.0
httpx==0.27.0  # For direct API calls if needed
asyncio==3.4.3

# Development tools
pytest==8.0.0
black==24.0.0
ruff==0.8.0
mypy==1.13.0
```

### Performance Benchmarks
- Question classification: ~100 msgs/sec on CPU
- LLM extraction: ~10 questions/sec (with batching)
- Embedding generation: ~50 msgs/sec on CPU  
- Hierarchical clustering: ~20 seconds for 10k questions
- Deduplication: ~5 seconds for 10k questions
- Total for 250k messages: ~45-60 minutes
- Service startup time: ~10 seconds (model loading)

### Cost Analysis via OpenRouter
- Infrastructure: Existing Docker environment
- LLM extraction options:
  - **Current**: `gemini-2.0-flash-exp` - $0.00 for 25k questions (FREE!)
  - Fallback: `gemini-flash-1.5` - $0.84 for 25k questions
  - Budget: `gemini-flash-1.5-8b` - $0.42 for 25k questions
  - Quality: `claude-3-haiku` - $2.81 for 25k questions
- Optional cluster labeling: ~$0.01 for 50 clusters
- **Total monthly cost: $0.00 while using experimental model!**
- Flexibility to experiment with different models

### References
- [FastAPI Best Practices](https://github.com/zhanymkanov/fastapi-best-practices)
- [uv Package Manager](https://docs.astral.sh/uv/)
- [HuggingFace Question Classifier](https://huggingface.co/shahrukhx01/question-vs-statement-classifier)
- [Sentence Transformers](https://www.sbert.net/)
- [HDBSCAN Documentation](https://hdbscan.readthedocs.io/)