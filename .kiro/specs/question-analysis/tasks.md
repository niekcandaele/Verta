# Implementation Tasks for Discord Question Analysis & Clustering System

## Overview
Implementation of a Python microservice for question extraction and clustering, integrated with the existing Node.js backend. The system uses a question classifier for filtering, OpenRouter LLMs for context extraction, and hierarchical clustering for grouping similar questions.

## Phase 1: Python Service Foundation
Set up the base Python microservice structure with FastAPI and Docker configuration.

- [ ] Initialize Python project structure
  - **Prompt**: Create data-science/ directory with standard Python project structure including src/, tests/, and configuration files. Use Python 3.12+ conventions.
  - **Requirements**: CON-006, CON-007
  - **Design ref**: Section 3 - Architecture Overview
  - **Files**: data-science/src/__init__.py, data-science/tests/__init__.py

- [ ] Create pyproject.toml with uv
  - **Prompt**: Create pyproject.toml with FastAPI, transformers, sentence-transformers, scipy, openai (for OpenRouter), and dev dependencies. Use uv package manager format.
  - **Requirements**: CON-006
  - **Design ref**: Section 3 - Project Configuration
  - **Files**: data-science/pyproject.toml, data-science/uv.lock

- [ ] Create Docker development configuration
  - **Prompt**: Create Dockerfile.dev that installs uv, syncs dependencies, and runs uvicorn with hot-reload on port 8000.
  - **Requirements**: CON-007
  - **Design ref**: Section 3 - Docker Configuration
  - **Files**: data-science/Dockerfile.dev

- [ ] Create Docker production configuration
  - **Prompt**: Create multi-stage Dockerfile with builder stage using uv and runtime stage with minimal footprint. Copy virtual environment from builder.
  - **Requirements**: CON-007
  - **Design ref**: Section 3 - Docker Configuration
  - **Files**: data-science/Dockerfile

- [ ] Extend docker-compose.yml
  - **Prompt**: Add data-science service to docker-compose.yml with ml_models volume for caching, environment variables, health check endpoint, and verta-network connectivity.
  - **Requirements**: CON-007
  - **Design ref**: Section 3 - Docker Compose Extension
  - **Files**: docker-compose.yml

## Phase 2: FastAPI Application Core
Build the FastAPI application with proper configuration and routing.

- [ ] Create FastAPI main application
  - **Prompt**: Create src/main.py with FastAPI app, CORS middleware for localhost:25000, lifespan for model preloading, and include api router at /api/v1.
  - **Requirements**: REQ-005
  - **Design ref**: Section 3 - FastAPI Application
  - **Files**: data-science/src/main.py

- [ ] Implement configuration management
  - **Prompt**: Create src/config.py with Pydantic Settings for OPENROUTER_API_KEY, LLM_MODEL (default: google/gemini-2.0-flash-exp), context window settings, and clustering thresholds.
  - **Requirements**: NFR-011
  - **Design ref**: Section 3 - Configuration
  - **Files**: data-science/src/config.py

- [ ] Create health check endpoint
  - **Prompt**: Create src/api/health.py with GET /health endpoint that returns service status, loaded models list, and memory usage. Used for Docker health checks.
  - **Requirements**: NFR-007
  - **Design ref**: Section 3 - Docker Configuration
  - **Files**: data-science/src/api/health.py

- [ ] Set up API router structure
  - **Prompt**: Create src/api/router.py that includes all endpoint routers (health, questions) and registers them with the main API router.
  - **Requirements**: REQ-005
  - **Design ref**: Section 3 - Service Communication
  - **Files**: data-science/src/api/router.py

## Phase 3: ML Models Implementation
Implement the question classification and clustering components.

- [ ] Create question classifier wrapper
  - **Prompt**: Create src/ml/classifier.py with QuestionClassifier class using shahrukhx01/question-vs-statement-classifier pipeline. Include batch classification method with 0.7 confidence threshold.
  - **Requirements**: REQ-009, REQ-013
  - **Design ref**: Section 3 - Step 1: Question Classification
  - **Files**: data-science/src/ml/classifier.py

- [ ] Implement hierarchical clustering
  - **Prompt**: Create src/ml/clustering.py with QuestionClusterer class using sentence-transformers for embeddings and scipy hierarchical clustering. Include centroid-based representative selection.
  - **Requirements**: REQ-014, REQ-015, REQ-016
  - **Design ref**: Section 3 - Step 4: Hierarchical Clustering
  - **Files**: data-science/src/ml/clustering.py

- [ ] Create model preloading utility
  - **Prompt**: Create src/utils/model_cache.py with async model loading on startup, caching to Docker volume, and singleton pattern for model instances.
  - **Requirements**: NFR-001
  - **Design ref**: Section 3 - Performance Optimizations
  - **Files**: data-science/src/utils/model_cache.py

## Phase 4: OpenRouter LLM Integration
Implement LLM-based question extraction using OpenRouter.

- [ ] Create OpenRouter client
  - **Prompt**: Create src/llm/openrouter_client.py with OpenRouterClient class using AsyncOpenAI, configured for google/gemini-2.0-flash-exp model with fallback support.
  - **Requirements**: REQ-022
  - **Design ref**: Section 3 - LLM Integration via OpenRouter
  - **Files**: data-science/src/llm/openrouter_client.py

- [ ] Implement question extraction
  - **Prompt**: Create extract_question method that takes context messages, formats prompt for complete question extraction, handles API errors with fallback to original message.
  - **Requirements**: REQ-010, REQ-011
  - **Design ref**: Section 3 - Question Extraction Implementation
  - **Files**: data-science/src/llm/openrouter_client.py

- [ ] Add batch processing for LLM calls
  - **Prompt**: Implement batch_extract_questions method that processes up to 20 questions in parallel with rate limiting and error recovery.
  - **Requirements**: NFR-001, NFR-002
  - **Design ref**: Section 3 - Batch Processing for Efficiency
  - **Files**: data-science/src/llm/openrouter_client.py

## Phase 5: API Endpoints
Create the REST API endpoints for question processing.

- [ ] Create Pydantic schemas
  - **Prompt**: Create src/schemas/questions.py with request/response models for classification, extraction, clustering operations including validation rules.
  - **Requirements**: REQ-005
  - **Design ref**: Section 3 - Service Communication
  - **Files**: data-science/src/schemas/questions.py

- [ ] Implement classification endpoint
  - **Prompt**: Create POST /api/v1/questions/classify that accepts messages array, returns classifications with confidence scores, handles batching internally.
  - **Requirements**: REQ-009
  - **Design ref**: Section 3 - Service Communication
  - **Files**: data-science/src/api/endpoints/questions.py

- [ ] Implement extraction endpoint
  - **Prompt**: Create POST /api/v1/questions/extract that accepts question with context, uses OpenRouter for extraction, returns extracted question with metadata.
  - **Requirements**: REQ-010, REQ-011
  - **Design ref**: Section 3 - LLM Integration
  - **Files**: data-science/src/api/endpoints/questions.py

- [ ] Implement clustering endpoint
  - **Prompt**: Create POST /api/v1/questions/cluster that accepts extracted questions, performs deduplication at 0.95 threshold, returns hierarchical clusters with representatives.
  - **Requirements**: REQ-014, REQ-015
  - **Design ref**: Section 3 - Hierarchical Clustering
  - **Files**: data-science/src/api/endpoints/questions.py

## Phase 6: Deduplication Logic
Implement question deduplication before clustering.

- [ ] Create deduplication module
  - **Prompt**: Create src/ml/deduplication.py with deduplicate_questions function using cosine similarity on embeddings, 0.95 threshold, keeps highest confidence version.
  - **Requirements**: REQ-017
  - **Design ref**: Section 3 - Deduplication Before Clustering
  - **Files**: data-science/src/ml/deduplication.py

- [ ] Add duplicate tracking
  - **Prompt**: Extend deduplication to track all duplicate IDs for each unique question, maintain mapping for traceability back to original messages.
  - **Requirements**: REQ-018
  - **Design ref**: Section 3 - Deduplication Before Clustering
  - **Files**: data-science/src/ml/deduplication.py

## Phase 7: Node.js Integration
Create the Node.js client for communicating with the Python service.

- [ ] Create DataScienceClient service
  - **Prompt**: Create backend/src/services/DataScienceClient.ts with methods for classify, extract, and cluster operations using fetch API with timeout and retry logic.
  - **Requirements**: CON-008
  - **Design ref**: Section 3 - DataScienceClient
  - **Files**: backend/src/services/DataScienceClient.ts

- [ ] Add environment configuration
  - **Prompt**: Add DATA_SCIENCE_URL environment variable to backend .env and Docker configuration, default to http://data-science:8000.
  - **Requirements**: NFR-011
  - **Design ref**: Section 3 - Node.js Backend Extensions
  - **Files**: backend/.env.example, docker-compose.yml

- [ ] Implement error handling and circuit breaker
  - **Prompt**: Add timeout handling, exponential backoff retry logic, and circuit breaker pattern to DataScienceClient for resilience.
  - **Requirements**: NFR-007
  - **Design ref**: Section 3 - DataScienceClient
  - **Files**: backend/src/services/DataScienceClient.ts

## Phase 8: Database Schema
Set up database tables for storing question analysis results.

- [ ] Create Kysely migration for question tables
  - **Prompt**: Create migration 004_add_question_tables.ts with question_clusters and question_classifications tables including tenant_id, extracted questions, and context tracking.
  - **Requirements**: REQ-018, REQ-019
  - **Design ref**: Section 3 - Data Models
  - **Files**: backend/src/database/migrations/004_add_question_tables.ts

- [ ] Add TypeScript types for question data
  - **Prompt**: Add QuestionCluster and QuestionClassification interfaces to database types with proper UUID and array types.
  - **Requirements**: REQ-018
  - **Design ref**: Section 3 - Data Models
  - **Files**: backend/src/database/types.ts

- [ ] Create repository classes
  - **Prompt**: Create QuestionRepository with methods for storing clusters, classifications, and checking for existing analysis by tenant and month.
  - **Requirements**: REQ-020, REQ-021
  - **Design ref**: Section 3 - Data Storage
  - **Files**: backend/src/repositories/QuestionRepository.ts

## Phase 9: Question Analysis Worker
Implement the BullMQ worker for processing questions.

- [ ] Create question analysis worker
  - **Prompt**: Create backend/src/workers/questionAnalysisWorker.ts that processes tenants sequentially, filters questions with classifier, extracts with LLM, clusters, and stores results.
  - **Requirements**: REQ-001, REQ-005, REQ-006
  - **Design ref**: Section 3 - Question Analysis Worker
  - **Files**: backend/src/workers/questionAnalysisWorker.ts

- [ ] Implement context window retrieval
  - **Prompt**: Add getContextWindow method that fetches ±2 minute messages from same author for each detected question.
  - **Requirements**: REQ-010
  - **Design ref**: Section 3 - Simplified Processing Pipeline
  - **Files**: backend/src/workers/questionAnalysisWorker.ts

- [ ] Add batch processing logic
  - **Prompt**: Implement message batching (1000 per batch) with progress tracking showing current tenant and percentage complete.
  - **Requirements**: NFR-001, NFR-002, NFR-014
  - **Design ref**: Section 3 - Question Analysis Worker
  - **Files**: backend/src/workers/questionAnalysisWorker.ts

- [ ] Implement tenant failure isolation
  - **Prompt**: Wrap tenant processing in try-catch to ensure one tenant's failure doesn't stop others, log errors with context, continue processing.
  - **Requirements**: REQ-008
  - **Design ref**: Section 3 - Question Analysis Worker
  - **Files**: backend/src/workers/questionAnalysisWorker.ts

## Phase 10: BullMQ Scheduling
Set up job scheduling for automated monthly analysis.

- [ ] Register worker with BullMQ
  - **Prompt**: Add questionAnalysisWorker to the worker registry, configure with appropriate concurrency and error handling settings.
  - **Requirements**: REQ-001
  - **Design ref**: Section 2 - Architecture Components
  - **Files**: backend/src/workers/index.ts

- [ ] Create monthly cron job
  - **Prompt**: Add cron job with pattern '0 2 1 * *' to run analysis on 1st of each month at 2 AM, calculate previous month's date range.
  - **Requirements**: REQ-001, REQ-002, REQ-003
  - **Design ref**: Section 2 - Automated Monthly Analysis
  - **Files**: backend/src/jobs/scheduledJobs.ts

- [ ] Add manual trigger endpoint
  - **Prompt**: Create POST /api/admin/analyze-questions endpoint that creates job with optional tenant filter and month override.
  - **Requirements**: REQ-007
  - **Design ref**: Section 2 - Manual Analysis Trigger
  - **Files**: backend/src/api/admin/questionAnalysis.ts

## Phase 11: Export Integration
Integrate question analysis into the data export process.

- [ ] Extend DataExportServiceImpl
  - **Prompt**: Add exportQuestionAnalysis method that queries question_clusters for tenant, formats for static JSON export.
  - **Requirements**: REQ-029, REQ-030
  - **Design ref**: Section 3 - Export Integration
  - **Files**: backend/src/services/dataExport/DataExportServiceImpl.ts

- [ ] Create questions.json generation
  - **Prompt**: Generate questions.json file per tenant with historical monthly analysis, clusters sorted by size, includes samples and metadata.
  - **Requirements**: REQ-030, REQ-032
  - **Design ref**: Section 3 - Static Export Integration
  - **Files**: backend/src/services/dataExport/DataExportServiceImpl.ts

- [ ] Update metadata with analysis flag
  - **Prompt**: Add hasQuestionAnalysis boolean to metadata.json when tenant has question analysis data available.
  - **Requirements**: REQ-034
  - **Design ref**: Section 3 - Static Export Integration
  - **Files**: backend/src/services/dataExport/DataExportServiceImpl.ts

## Phase 12: Frontend Display
Create the frontend components for displaying question insights.

- [ ] Extend data library types
  - **Prompt**: Add QuestionAnalysisData interface and getQuestionAnalysis function to frontend/lib/data.ts for loading static questions.json.
  - **Requirements**: REQ-027
  - **Design ref**: Previous design - Frontend Data Types
  - **Files**: frontend/lib/data.ts

- [ ] Create Insights page
  - **Prompt**: Create frontend/pages/insights.tsx that loads question data, displays clusters by month, handles missing data gracefully.
  - **Requirements**: REQ-027, REQ-031
  - **Design ref**: Previous design - Frontend Components
  - **Files**: frontend/pages/insights.tsx

- [ ] Build question cluster component
  - **Prompt**: Create QuestionClusters.tsx component that displays clusters sorted by size, shows representative and samples, expandable details.
  - **Requirements**: REQ-028, REQ-032
  - **Design ref**: Previous design - Frontend Components
  - **Files**: frontend/components/insights/QuestionClusters.tsx

- [ ] Add month selector
  - **Prompt**: Create MonthSelector.tsx that allows filtering insights by analysis month, shows available months from data.
  - **Requirements**: REQ-033
  - **Design ref**: Previous design - Frontend Components
  - **Files**: frontend/components/insights/MonthSelector.tsx

- [ ] Update navigation
  - **Prompt**: Add Insights tab to Layout.tsx navigation, only show when hasQuestionAnalysis flag is true in metadata.
  - **Requirements**: REQ-031, REQ-034
  - **Design ref**: Previous design - Frontend Components
  - **Files**: frontend/components/Layout.tsx

## Phase 13: Testing
Implement comprehensive tests for all components.

- [ ] Python unit tests for classifier
  - **Prompt**: Write pytest tests for QuestionClassifier including edge cases, confidence thresholds, batch processing, error handling.
  - **Requirements**: REQ-013
  - **Design ref**: Section 3 - Testing Strategy
  - **Files**: data-science/tests/test_classifier.py

- [ ] Python unit tests for clustering
  - **Prompt**: Write tests for hierarchical clustering including minimum size handling, representative selection, edge cases with few questions.
  - **Requirements**: REQ-014, REQ-015
  - **Design ref**: Section 3 - Testing Strategy
  - **Files**: data-science/tests/test_clustering.py

- [ ] FastAPI integration tests
  - **Prompt**: Test all API endpoints with mock ML models, verify request/response schemas, test error conditions and timeouts.
  - **Requirements**: REQ-005
  - **Design ref**: Section 3 - Testing Strategy
  - **Files**: data-science/tests/test_api.py

- [ ] Node.js DataScienceClient tests
  - **Prompt**: Test client with mock fetch responses, verify retry logic, timeout handling, circuit breaker behavior.
  - **Requirements**: CON-008
  - **Design ref**: Section 3 - Node.js Tests
  - **Files**: backend/src/services/DataScienceClient.test.ts

- [ ] Worker integration tests
  - **Prompt**: Test full worker flow with mock services, verify tenant iteration, progress tracking, error isolation.
  - **Requirements**: REQ-005, REQ-006, REQ-008
  - **Design ref**: Section 3 - Testing Strategy
  - **Files**: backend/tests/workers/questionAnalysisWorker.test.ts

## Phase 14: Performance Optimization
Optimize for production workloads.

- [ ] Implement model caching
  - **Prompt**: Cache ML models in Docker volume, check for cached models on startup, download only if missing.
  - **Requirements**: NFR-001
  - **Design ref**: Section 3 - Performance Optimizations
  - **Files**: data-science/src/utils/model_cache.py

- [ ] Add request batching configuration
  - **Prompt**: Make batch sizes configurable via environment variables for classification, extraction, and clustering operations.
  - **Requirements**: NFR-001, NFR-002
  - **Design ref**: Section 3 - Performance Characteristics
  - **Files**: data-science/src/config.py

- [ ] Optimize memory usage
  - **Prompt**: Implement streaming processing for large datasets, clear embeddings after clustering, use generators where possible.
  - **Requirements**: NFR-003
  - **Design ref**: Section 3 - Memory Usage Profile
  - **Files**: data-science/src/ml/clustering.py

## Phase 15: Documentation and Deployment
Final documentation and deployment preparation.

- [ ] Create API documentation
  - **Prompt**: Add OpenAPI/Swagger documentation to FastAPI endpoints with examples, schemas, and error responses.
  - **Requirements**: NFR-013
  - **Design ref**: Section 3 - Service Communication
  - **Files**: data-science/src/api/endpoints/questions.py

- [ ] Write deployment README
  - **Prompt**: Create data-science/README.md with setup instructions, environment variables, Docker commands, troubleshooting guide.
  - **Requirements**: CON-007
  - **Design ref**: Section 3 - Docker Configuration
  - **Files**: data-science/README.md

- [ ] Add monitoring and logging
  - **Prompt**: Add structured logging with correlation IDs, performance metrics, error tracking with context.
  - **Requirements**: NFR-009
  - **Design ref**: Section 3 - Security Considerations
  - **Files**: data-science/src/utils/logging.py

## Success Criteria
- [ ] Python service starts and passes health checks
- [ ] Question classifier achieves >95% accuracy on test data
- [ ] LLM extraction completes for 25k questions within budget ($0.00 with Gemini 2.0 Flash experimental)
- [ ] Clustering produces meaningful groups (manual verification)
- [ ] Inter-service communication is reliable with proper error handling
- [ ] All active tenants are processed in monthly job
- [ ] Frontend displays question insights correctly
- [ ] Total processing time <1 hour for 250k messages
- [ ] Memory usage stays under 8GB