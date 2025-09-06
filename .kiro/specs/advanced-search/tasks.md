# Implementation Tasks for Advanced Hybrid Search

## Overview
This implementation plan breaks down the advanced hybrid search feature into 4 phases, building incrementally from database schema to full frontend integration. Each phase delivers testable functionality while maintaining backward compatibility.

**Important Note**: The scope includes ALL messages, not just questions, ensuring comprehensive search coverage across 100% of content.

## Phase 1: Database Schema & Embeddings Infrastructure
Add vector columns to both golden_answers and messages tables, extend infrastructure for all embeddings.

- [ ] Task 1: Create database migration for golden_answers vector column
  - **Prompt**: Create backend/src/database/migrations/016-add-golden-answers-vector.ts that adds a vector column to the golden_answers table. The column should be named 'embedding' with type VECTOR(1536) to match our OpenAI embeddings. Follow the existing migration pattern.
  - **Requirements**: REQ-001, REQ-004
  - **Design ref**: Section "Database Changes"
  - **Files**: backend/src/database/migrations/016-add-golden-answers-vector.ts

- [ ] Task 2: Create database migration for messages vector column
  - **Prompt**: Create backend/src/database/migrations/017-add-messages-vector.ts that adds a vector column to the messages table. The column should be named 'embedding' with type VECTOR(1536). Follow the existing migration pattern and include an index on (channel_id, embedding IS NOT NULL).
  - **Requirements**: REQ-001, REQ-004
  - **Design ref**: Section "Database Changes"
  - **Files**: backend/src/database/migrations/017-add-messages-vector.ts

- [ ] Task 3: Update database types for vector columns
  - **Prompt**: Update backend/src/database/types.ts to add 'embedding?: string' to both GoldenAnswersTable and MessagesTable interfaces. The embedding is stored as a JSON string array in the database.
  - **Requirements**: REQ-001
  - **Design ref**: Section "Database Changes"
  - **Files**: backend/src/database/types.ts

- [ ] Task 4: Extend analysis worker for golden answer embeddings
  - **Prompt**: Add a new case 'generate-golden-answer-embeddings' to backend/src/workers/analysisWorker.ts. Query golden answers without embeddings, generate embeddings in batches of 100 using mlClient.embedBatch(), and update records. Follow the pattern from 'generate-question-embeddings' case.
  - **Requirements**: REQ-001, REQ-004
  - **Design ref**: Section "Embedding Generation Extension"
  - **Files**: backend/src/workers/analysisWorker.ts

- [ ] Task 5: Extend analysis worker for message embeddings
  - **Prompt**: Add a new case 'generate-message-embeddings' to backend/src/workers/analysisWorker.ts. Query messages without embeddings in batches of 100, generate embeddings using mlClient.embedBatch(), and update records with embeddings. Include proper error handling and progress logging.
  - **Requirements**: REQ-001, REQ-004
  - **Design ref**: Section "Embedding Generation Extension"
  - **Files**: backend/src/workers/analysisWorker.ts

- [ ] Task 6: Extend sync process for real-time embeddings
  - **Prompt**: Update backend/src/workers/channelSyncWorker.ts to generate embeddings for new messages during sync. After storing messages, collect their content in batches, generate embeddings via mlClient.embedBatch(), and update the messages with embeddings. Add error handling to not fail sync if embedding fails.
  - **Requirements**: REQ-001
  - **Design ref**: Section "Sync Process Extension"
  - **Files**: backend/src/workers/channelSyncWorker.ts

- [ ] Task 7: Add embedding generation to hourly scheduler
  - **Prompt**: Update backend/src/workers/hourlyTriggerWorker.ts to schedule embedding generation jobs. Add jobs for both 'generate-golden-answer-embeddings' and 'generate-message-embeddings' to run alongside existing hourly analysis tasks.
  - **Requirements**: REQ-001
  - **Design ref**: Section "Implementation Details"
  - **Files**: backend/src/workers/hourlyTriggerWorker.ts

## Phase 2: Python Search Module
Implement hybrid search logic in Python ML service.

- [ ] Task 8: Create search module structure
  - **Prompt**: Create python-ml-service/endpoints/search.py with a FastAPI endpoint POST /api/ml/search. The endpoint should accept query, embedding, and searchConfigs parameters. Start with returning mock results to verify the endpoint works.
  - **Requirements**: REQ-004, REQ-003
  - **Design ref**: Section "Python ML Service Endpoint"
  - **Files**: python-ml-service/endpoints/search.py, python-ml-service/app.py

- [ ] Task 9: Add TiDB hybrid search check
  - **Prompt**: In python-ml-service/services/search.py, implement check_hybrid_search_available() function that verifies TiDB supports vector functions. Try executing a simple VEC_COSINE_DISTANCE query and return True if successful, False otherwise. Use the db_service from services/database.py.
  - **Requirements**: REQ-005
  - **Design ref**: Section "search.py"
  - **Files**: python-ml-service/services/search.py

- [ ] Task 10: Implement search query logic
  - **Prompt**: In python-ml-service/services/search.py, implement hybrid_search() that executes vector similarity and text searches against TiDB. For each searchConfig, build a query combining VEC_COSINE_DISTANCE on vectorField and text matching on textField. Apply filters from the config. Return combined results.
  - **Requirements**: REQ-001, REQ-002, REQ-004
  - **Design ref**: Section "search.py"
  - **Files**: python-ml-service/services/search.py

- [ ] Task 11: Add reranking with message excerpts
  - **Prompt**: In python-ml-service/services/rerank.py, implement rerank_results() that uses a reranking model to sort results by relevance. For message results, truncate content to 200 characters for the excerpt. Use the existing OpenRouter client to call a reranking model.
  - **Requirements**: REQ-002, REQ-007
  - **Design ref**: Section "search.py"
  - **Files**: python-ml-service/services/rerank.py

## Phase 3: Backend API Integration
Create Node.js API endpoints that coordinate with Python service.

- [ ] Task 12: Create SearchService
  - **Prompt**: Create backend/src/services/SearchService.ts that coordinates search requests. Add a search() method that takes query and options, gets embedding from mlClient, calls Python search endpoint, and formats results. Follow the pattern from existing services.
  - **Requirements**: REQ-003, REQ-006
  - **Design ref**: Section "SearchService"
  - **Files**: backend/src/services/SearchService.ts

- [ ] Task 13: Extend MlClientService with search method
  - **Prompt**: Add a search() method to backend/src/services/MlClientService.ts that calls the Python /api/ml/search endpoint. The method should handle query, embedding, and searchConfigs parameters. Follow the existing pattern for other ML service calls.
  - **Requirements**: REQ-003, REQ-004
  - **Design ref**: Section "SearchService"
  - **Files**: backend/src/services/MlClientService.ts

- [ ] Task 14: Create search controller with rate limiting
  - **Prompt**: Create backend/src/controllers/SearchController.ts with a POST endpoint. Apply rate limiting of 10 requests/second with burst of 20 using express-rate-limit. The controller should validate input, call SearchService, and return formatted results.
  - **Requirements**: REQ-003, REQ-006, Non-functional rate limiting
  - **Design ref**: Section "External API"
  - **Files**: backend/src/controllers/SearchController.ts, backend/src/routes/v1/search.ts

- [ ] Task 15: Add search DTOs to shared types
  - **Prompt**: Create shared-types/src/search.ts with SearchRequest and SearchResult interfaces matching the API design. Include proper TypeScript types for all fields. Export from shared-types index.
  - **Requirements**: REQ-003
  - **Design ref**: Section "Search Request DTO"
  - **Files**: shared-types/src/search.ts, shared-types/src/index.ts

## Phase 4: Frontend Search Interface
Build user-friendly search UI with real-time results.

- [ ] Task 16: Create SearchComponent skeleton
  - **Prompt**: Create frontend/components/Search.tsx with a search input field. Use Tailwind classes matching the existing dark theme. Add a magnifying glass icon from react-icons. The component should manage its own state for the query.
  - **Requirements**: REQ-006
  - **Design ref**: Section "SearchComponent"
  - **Files**: frontend/components/Search.tsx

- [ ] Task 17: Add debounced search with API integration
  - **Prompt**: Update frontend/components/Search.tsx to call the search API with 300ms debounce using a custom useDebounce hook. Add the search method to frontend/lib/api-client.ts. Show results in a dropdown below the search input.
  - **Requirements**: REQ-006
  - **Design ref**: Section "SearchComponent"
  - **Files**: frontend/components/Search.tsx, frontend/lib/api-client.ts, frontend/hooks/useDebounce.ts

- [ ] Task 18: Create search results display
  - **Prompt**: Create frontend/components/SearchResults.tsx to display search results. Show golden answers with full content and messages with excerpts. Include relevance scores as subtle indicators. Use glass morphism styling to match the theme.
  - **Requirements**: REQ-006, REQ-007
  - **Design ref**: Section "SearchComponent"
  - **Files**: frontend/components/SearchResults.tsx

- [ ] Task 19: Add loading states and error handling
  - **Prompt**: Update frontend/components/Search.tsx to show a loading spinner during search and handle errors gracefully. Use the existing loading component pattern. Show user-friendly error messages if search fails.
  - **Requirements**: REQ-006
  - **Design ref**: Section "SearchComponent"
  - **Files**: frontend/components/Search.tsx

- [ ] Task 20: Integrate search into main layout
  - **Prompt**: Update frontend/components/Layout.tsx to include the Search component in the navbar. Position it on the right side of the navbar for desktop, hidden on mobile. Ensure it doesn't break the existing layout.
  - **Requirements**: REQ-006
  - **Design ref**: Section "SearchComponent"
  - **Files**: frontend/components/Layout.tsx

## Verification Checklist

### Phase Checkpoints
- [ ] Phase 1: Database migrations run, embeddings generating for all content
- [ ] Phase 2: Python search endpoint returns reranked results
- [ ] Phase 3: Backend API endpoint functional with rate limiting
- [ ] Phase 4: Frontend search fully integrated and responsive

### Requirements Verification
- [ ] REQ-001: Hybrid search combining vector and text ✓
- [ ] REQ-002: Equal search across golden answers and messages ✓
- [ ] REQ-003: API accepts queries and returns ranked results ✓
- [ ] REQ-004: Python service handles search logic ✓
- [ ] REQ-005: Error when hybrid search unavailable ✓
- [ ] REQ-006: Frontend real-time search interface ✓
- [ ] REQ-007: Message excerpts only in results ✓

### Non-Functional Verification
- [ ] Performance: <500ms for 95% of queries
- [ ] Rate limiting: 10 req/sec per user working
- [ ] All messages have embeddings (>95% coverage)
- [ ] Tenant isolation maintained