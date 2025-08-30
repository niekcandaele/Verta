# Implementation Tasks: Question Clustering and Analysis System

## Overview
Building an ML-powered question clustering system that identifies, rephrases, and groups similar questions from Discord messages. The implementation uses a two-service architecture: Node.js for orchestration and Python for ML model hosting. We'll build this in 6 phases, starting with basic infrastructure and progressively adding ML capabilities, clustering logic, and API endpoints.

## Phase 1: Python ML Service Skeleton
**Goal**: Create a containerized Python FastAPI service with health checks
**Demo**: "At standup, I can show: the ML service responding to health checks via curl"

### Tasks
- [x] Task 1.1: Create Python service directory structure
  - **Output**: Basic Python project structure
  - **Files**: `python-ml-service/`, `requirements.txt`, `Dockerfile`
  - **Verify**: Directory structure exists

- [x] Task 1.2: Implement FastAPI application with health endpoint
  - **Depends on**: 1.1
  - **Output**: FastAPI app with `/health` endpoint
  - **Files**: `python-ml-service/app.py`, `python-ml-service/config.py`
  - **Verify**: `python app.py` starts server locally

- [x] Task 1.3: Create Dockerfile for Python service
  - **Depends on**: 1.2
  - **Output**: Containerized Python service
  - **Files**: `python-ml-service/Dockerfile`
  - **Verify**: `docker build -t ml-service python-ml-service/` succeeds

- [x] Task 1.4: Add ML service to docker-compose.yml
  - **Depends on**: 1.3
  - **Output**: Service integrated with existing stack
  - **Files**: `docker-compose.yml`
  - **Verify**: `docker compose up ml-service` starts successfully

### Phase 1 Checkpoint
- [x] Run build: `docker compose build ml-service`
- [x] Start service: `docker compose up ml-service`
- [x] Manual verification: `curl http://localhost:8000/health` returns 200
- [x] **Demo ready**: Show health endpoint responding with service status

## Phase 2: ML Models Integration
**Goal**: Load HuggingFace models and expose classification/embedding endpoints
**Demo**: "At standup, I can show: the service classifying text as question/not-question and generating embeddings"

### Tasks
- [x] Task 2.1: Implement question classifier model loading
  - **Output**: HuggingFace question classifier loaded on startup
  - **Files**: `python-ml-service/models/classifier.py`
  - **Verify**: Model loads successfully (check logs)

- [x] Task 2.2: Add classification endpoint
  - **Depends on**: 2.1
  - **Output**: `/api/ml/classify` endpoint working
  - **Files**: `python-ml-service/endpoints/classify.py`
  - **Verify**: `curl -X POST http://localhost:8000/api/ml/classify -d '{"text":"Is this working?"}'`

- [x] Task 2.3: Implement BGE-M3 embedding model loading
  - **Output**: Embedding model loaded with CPU optimization
  - **Files**: `python-ml-service/models/embeddings.py`
  - **Verify**: Model loads within 4GB RAM constraint

- [x] Task 2.4: Add embedding generation endpoint
  - **Depends on**: 2.3
  - **Output**: `/api/ml/embed` endpoint working
  - **Files**: `python-ml-service/endpoints/embed.py`
  - **Verify**: Returns 768-dimension vector for input text

- [x] Task 2.5: Add API key authentication to Python service
  - **Output**: Endpoints require valid API key
  - **Files**: `python-ml-service/middleware/auth.py`
  - **Verify**: Requests without key return 401

### Phase 2 Checkpoint
- [x] Test classification: Text correctly identified as question/statement
- [x] Test embeddings: Returns vector of correct dimensions
- [x] Memory check: Service stays within 4GB limit
- [x] **Demo ready**: Live classification and embedding generation via curl

## Phase 3: Database Schema & Repositories
**Goal**: Create TiDB tables for question clustering and TypeScript repositories
**Demo**: "At standup, I can show: new tables in TiDB and repository classes that can perform CRUD operations"

### Tasks
- [ ] Task 3.1: Create database migration for question tables
  - **Output**: Migration files for three new tables
  - **Files**: `backend/src/db/migrations/add_question_clustering_tables.ts`
  - **Verify**: Migration runs without errors

- [ ] Task 3.2: Add vector column support to Kysely types
  - **Depends on**: 3.1
  - **Output**: TypeScript types for vector columns
  - **Files**: `backend/src/db/types.ts`, `shared-types/src/db.ts`
  - **Verify**: TypeScript compilation succeeds

- [ ] Task 3.3: Create QuestionCluster repository
  - **Depends on**: 3.2
  - **Output**: Repository for question clusters with vector search
  - **Files**: `backend/src/repositories/QuestionClusterRepository.ts`
  - **Verify**: Repository methods compile without errors

- [ ] Task 3.4: Create QuestionInstance repository
  - **Depends on**: 3.2
  - **Output**: Repository for individual question instances
  - **Files**: `backend/src/repositories/QuestionInstanceRepository.ts`
  - **Verify**: Repository methods compile without errors

- [ ] Task 3.5: Create AnalysisJob repository
  - **Depends on**: 3.2
  - **Output**: Repository for tracking analysis jobs
  - **Files**: `backend/src/repositories/AnalysisJobRepository.ts`
  - **Verify**: Repository methods compile without errors

### Phase 3 Checkpoint
- [ ] Run migrations: `npm run migrate:latest`
- [ ] Run lint: `npm run lint`
- [ ] Run build: `npm run build`
- [ ] Manual verification: Check tables exist in TiDB with proper indexes
- [ ] **Demo ready**: Show new tables in database and basic repository operations

## Phase 4: Node.js ML Client & LLM Integration
**Goal**: Create Node.js service to communicate with Python ML service and Gemini Flash
**Demo**: "At standup, I can show: Node.js calling Python service and rephrasing multi-part questions via LLM"

### Tasks
- [x] Task 4.1: Create ML client service
  - **Output**: TypeScript service for ML communication
  - **Files**: `backend/src/services/MlClientService.ts`
  - **Verify**: Service methods have proper types

- [x] Task 4.2: Implement retry logic and circuit breaker
  - **Depends on**: 4.1
  - **Output**: Resilient HTTP client with exponential backoff
  - **Files**: Update `backend/src/services/MlClientService.ts`
  - **Verify**: Handles service downtime gracefully

- [x] Task 4.3: Add LLM rephrase endpoint to Python service
  - **Output**: `/api/ml/rephrase` endpoint calling Gemini Flash
  - **Files**: `python-ml-service/endpoints/rephrase.py`, `python-ml-service/services/llm.py`
  - **Verify**: Multi-message arrays get coherent rephrasing

- [x] Task 4.4: Create question processing service
  - **Depends on**: 4.1, 4.3
  - **Output**: Service orchestrating the ML pipeline
  - **Files**: `backend/src/services/QuestionProcessingService.ts`
  - **Verify**: Can process a message through full pipeline

- [x] Task 4.5: Add environment configuration
  - **Output**: All ML-related env vars configured
  - **Files**: `.env.example`, `backend/src/config/ml.ts`
  - **Verify**: Config loads from environment

### Phase 4 Checkpoint
- [x] Test ML client: Successfully calls all Python endpoints
- [x] Test LLM integration: Rephrases multi-part questions
- [x] Run lint: `npm run lint`
- [x] **Demo ready**: Show end-to-end question processing pipeline

## Phase 5: Analysis Worker & Queue Integration
**Goal**: Create background worker for processing messages through ML pipeline
**Demo**: "At standup, I can show: messages being processed in batches with progress tracking"

### Tasks
- [ ] Task 5.1: Create analysis queue definition
  - **Output**: BullMQ queue for analysis jobs
  - **Files**: `backend/src/queues/analysisQueue.ts`
  - **Verify**: Queue connects to Redis

- [ ] Task 5.2: Implement analysis worker
  - **Depends on**: 5.1
  - **Output**: Worker processing messages in rolling window
  - **Files**: `backend/src/workers/analysisWorker.ts`
  - **Verify**: Worker starts and processes test job

- [ ] Task 5.3: Add message batching logic
  - **Depends on**: 5.2
  - **Output**: Efficient batch processing of messages
  - **Files**: Update `backend/src/workers/analysisWorker.ts`
  - **Verify**: Processes 100 messages per batch

- [ ] Task 5.4: Implement context extraction
  - **Depends on**: 5.2
  - **Output**: Extracts 5-message context window
  - **Files**: `backend/src/services/MessageContextService.ts`
  - **Verify**: Returns surrounding messages from same author

- [ ] Task 5.5: Add vector similarity search
  - **Output**: Find similar questions using TiDB vectors
  - **Files**: Update `backend/src/repositories/QuestionClusterRepository.ts`
  - **Verify**: Returns questions above similarity threshold

- [ ] Task 5.6: Implement clustering logic
  - **Depends on**: 5.5
  - **Output**: Groups similar questions or creates new clusters
  - **Files**: `backend/src/services/ClusteringService.ts`
  - **Verify**: Questions with >0.85 similarity get clustered

### Phase 5 Checkpoint
- [ ] Process test batch: 100 messages processed successfully
- [ ] Check clustering: Similar questions grouped together
- [ ] Monitor memory: Worker stays within limits
- [ ] **Demo ready**: Show live processing with progress updates

## Phase 6: REST API Endpoints
**Goal**: Expose admin and public APIs for triggering analysis and viewing results
**Demo**: "At standup, I can show: triggering analysis via admin API and retrieving clusters via public API"

### Tasks
- [ ] Task 6.1: Create admin analysis endpoint
  - **Output**: Protected endpoint to trigger processing
  - **Files**: `backend/src/routes/api/admin/analysis.ts`
  - **Verify**: Requires admin API key

- [ ] Task 6.2: Add job progress tracking
  - **Depends on**: 6.1
  - **Output**: Real-time job status updates
  - **Files**: Update `backend/src/workers/analysisWorker.ts`
  - **Verify**: Progress updates in database

- [ ] Task 6.3: Create public clusters endpoint
  - **Output**: Endpoint returning clustered questions
  - **Files**: `backend/src/routes/api/v1/questions.ts`
  - **Verify**: Returns clusters with counts

- [ ] Task 6.4: Add cluster statistics endpoint
  - **Depends on**: 6.3
  - **Output**: Aggregated statistics by tenant
  - **Files**: Update `backend/src/routes/api/v1/questions.ts`
  - **Verify**: Returns meaningful metrics

- [ ] Task 6.5: Implement feature flags
  - **Output**: Runtime control of processing features
  - **Files**: `backend/src/config/features.ts`
  - **Verify**: Features can be toggled without restart

- [ ] Task 6.6: Add API documentation
  - **Output**: OpenAPI spec for new endpoints
  - **Files**: `backend/src/routes/api/openapi.yaml`
  - **Verify**: Documentation accessible at `/api/docs`

### Phase 6 Checkpoint
- [ ] Test admin API: Successfully triggers analysis
- [ ] Test public API: Returns clustered questions
- [ ] Run full build: `npm run build`
- [ ] Run lint: `npm run lint`
- [ ] **Demo ready**: Complete flow from triggering to viewing results

## Final Verification
- [ ] All requirements from design doc met
- [ ] Process 1000 messages in under 1 minute
- [ ] Similarity threshold configurable via environment
- [ ] Rolling window (30-7 days) working correctly
- [ ] Admin endpoints require authentication
- [ ] Public endpoints accessible without auth
- [ ] Docker memory limits enforced (4GB for ML service)
- [ ] Feature flags control all ML features
- [ ] No errors in production logs
- [ ] Documentation complete and accurate