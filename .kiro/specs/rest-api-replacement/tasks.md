# Implementation Tasks: REST API Replacement for Static Export System

## Overview
We're replacing the static JSON export system with a REST API that serves content directly from the database, and containerizing the frontend with runtime tenant configuration. The implementation is broken into 6 phases to ensure incremental, testable progress.

## Phase 1: Frontend Containerization
**Goal**: Get the frontend running in Docker with hot-reload
**Demo**: "At standup, I can show: The frontend running in a container at localhost:3000 with hot-reload working"

### Tasks
- [x] Task 1.1: Create frontend Dockerfile
  - **Output**: Multi-stage Dockerfile for development
  - **Files**: `frontend/Dockerfile`
  - **Verify**: `docker build -t verta-frontend:dev ./frontend --target dev`

- [x] Task 1.2: Update docker-compose.yml with frontend service
  - **Depends on**: 1.1
  - **Output**: Frontend service configuration with volumes and environment
  - **Files**: `docker-compose.yml`
  - **Remove**: `_data` volume mount, UID/GID user mapping
  - **Verify**: `docker compose config | grep frontend`

- [x] Task 1.3: Configure Next.js for containerized development
  - **Output**: Updated Next.js config for SSR (not static export)
  - **Files**: `frontend/next.config.ts`
  - **Remove**: `output: 'export'` configuration
  - **Verify**: Check config doesn't have static export

- [x] Task 1.4: Add frontend environment variables
  - **Output**: Environment variables for tenant and API URL
  - **Files**: `.env.example`, `.env`
  - **Verify**: `grep NEXT_PUBLIC .env`

- [x] Task 1.5: Test frontend container with hot-reload
  - **Depends on**: 1.1, 1.2, 1.3, 1.4
  - **Output**: Frontend accessible at localhost:3000
  - **Verify**: `docker compose up frontend`, modify a component, see changes

### Phase 1 Checkpoint
- [x] Run docker compose: `docker compose up frontend`
- [x] Access frontend: `curl http://localhost:3000`
- [x] Hot-reload works: Edit a file and see changes without restart
- [x] **Demo ready**: Show containerized frontend with hot-reload

## Phase 2: Basic API Structure
**Goal**: Create the API framework with one working endpoint
**Demo**: "At standup, I can show: A tenant endpoint returning data with proper error handling"

### Tasks
- [x] Task 2.1: Create ContentService skeleton
  - **Output**: Service class structure following existing patterns
  - **Files**: `backend/src/services/content/ContentService.ts`, `backend/src/services/content/index.ts`
  - **Verify**: Service exports correctly

- [x] Task 2.2: Create API route structure
  - **Output**: Route folder and base router
  - **Files**: `backend/src/routes/api/v1/content.ts`, `backend/src/routes/api/v1/index.ts`
  - **Verify**: Routes compile without errors

- [x] Task 2.3: Add CORS middleware
  - **Output**: Permissive CORS configuration
  - **Files**: `backend/src/middleware/cors.ts`
  - **Verify**: Middleware exports correctly

- [x] Task 2.4: Update error handler for RFC 7807
  - **Output**: Problem Details error format
  - **Files**: `backend/src/middleware/errorHandler.ts`
  - **Verify**: Error responses follow RFC 7807 format

- [x] Task 2.5: Mount v1 API routes
  - **Depends on**: 2.2
  - **Output**: API routes accessible at /api/v1
  - **Files**: `backend/src/app.ts`
  - **Verify**: `curl http://localhost:25000/api/v1/tenant`

- [x] Task 2.6: Implement tenant endpoint
  - **Depends on**: 2.1, 2.2, 2.5
  - **Output**: GET /api/v1/tenant working with header validation
  - **Files**: `backend/src/routes/api/v1/content.ts`
  - **Verify**: `curl -H "X-Tenant-Slug: test" http://localhost:25000/api/v1/tenant`

### Phase 2 Checkpoint
- [x] Run backend: `docker compose up app`
- [x] Test tenant endpoint: Returns data with header, 400 without
- [x] CORS works: Frontend can call backend
- [x] **Demo ready**: Show working tenant endpoint with proper error handling

## Phase 3: Complete API Implementation
**Goal**: Implement all content endpoints with database integration
**Demo**: "At standup, I can show: All API endpoints returning real data from the database"

### Tasks
- [x] Task 3.1: Implement channels endpoint
  - **Output**: GET /api/v1/channels with tenant filtering
  - **Files**: `backend/src/routes/api/v1/content.ts`, `backend/src/services/content/ContentService.ts`
  - **Verify**: `curl -H "X-Tenant-Slug: test" http://localhost:25000/api/v1/channels`

- [x] Task 3.2: Implement single channel endpoint
  - **Output**: GET /api/v1/channels/:channelId
  - **Files**: `backend/src/routes/api/v1/content.ts`
  - **Verify**: Returns specific channel data

- [x] Task 3.3: Implement messages endpoint with pagination
  - **Output**: GET /api/v1/channels/:channelId/messages with page/limit
  - **Files**: `backend/src/routes/api/v1/content.ts`, `backend/src/services/content/ContentService.ts`
  - **Verify**: Pagination meta in response

- [x] Task 3.4: Implement threads endpoint
  - **Output**: GET /api/v1/channels/:channelId/threads
  - **Files**: `backend/src/routes/api/v1/content.ts`
  - **Verify**: Returns thread summaries for forum channels

- [x] Task 3.5: Implement thread messages endpoint
  - **Output**: GET /api/v1/channels/:channelId/threads/:threadId/messages
  - **Files**: `backend/src/routes/api/v1/content.ts`
  - **Verify**: Returns messages for specific thread

- [x] Task 3.6: Implement branding endpoint
  - **Output**: GET /api/v1/branding
  - **Files**: `backend/src/routes/api/v1/content.ts`
  - **Verify**: Returns tenant branding data

- [x] Task 3.7: Add rate limiting
  - **Output**: Rate limiting on all public endpoints
  - **Files**: `backend/src/middleware/rateLimit.ts`, `backend/src/routes/api/v1/content.ts`
  - **Verify**: 429 response after exceeding limit

### Phase 3 Checkpoint
- [x] All endpoints return data: Test each endpoint with curl
- [x] Pagination works: Page through messages
- [x] Error handling consistent: Missing header returns 400
- [x] Rate limiting active: Excessive requests return 429
- [x] **Demo ready**: Show all endpoints working with real data

## Phase 4: Frontend API Migration
**Goal**: Replace filesystem operations with API calls
**Demo**: "At standup, I can show: The frontend fetching all data from the API instead of files"

### Tasks
- [x] Task 4.1: Create axios-based API client
  - **Output**: API client with tenant header configuration
  - **Files**: `frontend/lib/api-client.ts`
  - **Verify**: Client exports with proper types

- [x] Task 4.2: Install axios
  - **Output**: Axios added to frontend dependencies
  - **Files**: `frontend/package.json`
  - **Verify**: `cd frontend && npm list axios`

- [x] Task 4.3: Update getTenantSlug function
  - **Output**: Use NEXT_PUBLIC_TENANT_SLUG instead of build-time var
  - **Files**: `frontend/lib/data.ts`
  - **Remove**: Old filesystem-based getTenantSlug
  - **Verify**: Function returns runtime env var

- [x] Task 4.4: Replace getTenantMetadata with API call
  - **Depends on**: 4.1
  - **Output**: Fetch metadata from API
  - **Files**: `frontend/lib/data.ts`
  - **Remove**: File reading logic
  - **Verify**: Metadata loads from API

- [x] Task 4.5: Replace getChannels with API call
  - **Depends on**: 4.1
  - **Output**: Fetch channels from API
  - **Files**: `frontend/lib/data.ts`
  - **Remove**: File reading logic
  - **Verify**: Channel list loads from API

- [x] Task 4.6: Replace getChannelMessages with API call
  - **Depends on**: 4.1
  - **Output**: Fetch paginated messages from API
  - **Files**: `frontend/lib/data.ts`
  - **Remove**: File reading logic
  - **Verify**: Messages load with pagination

- [x] Task 4.7: Update forum thread functions
  - **Depends on**: 4.1
  - **Output**: Fetch threads from API
  - **Files**: `frontend/lib/data.ts`
  - **Remove**: File reading logic
  - **Verify**: Forum threads load from API

- [x] Task 4.8: Add error handling UI
  - **Output**: User-friendly error messages for API failures
  - **Files**: `frontend/components/ErrorBoundary.tsx`
  - **Verify**: Errors display nicely when API is down

### Phase 4 Checkpoint
- [x] Frontend builds: `cd frontend && npm run build`
- [x] No filesystem imports: Verify no `fs` imports remain
- [x] API client configured: Tenant header included
- [x] Error handling works: Disconnect backend, see error UI
- [x] **Demo ready**: Show frontend fully powered by API

## Phase 5: Full Integration
**Goal**: Connect all pieces and verify end-to-end functionality
**Demo**: "At standup, I can show: The complete system working with docker-compose up"

### Tasks
- [x] Task 5.1: Update docker-compose for full stack
  - **Output**: All services configured correctly
  - **Files**: `docker-compose.yml`
  - **Verify**: `docker compose up` starts everything

- [x] Task 5.2: Configure frontend API URL
  - **Output**: Frontend connects to backend correctly
  - **Files**: `.env`, `docker-compose.yml`
  - **Verify**: No CORS errors in browser console

- [x] Task 5.3: Test tenant isolation
  - **Output**: Different tenants show different data
  - **Verify**: Change NEXT_PUBLIC_TENANT_SLUG, see different content

- [x] Task 5.4: Verify data sync updates
  - **Output**: New synced data appears immediately
  - **Verify**: Run sync, refresh page, see new data

- [x] Task 5.5: Performance testing
  - **Output**: Response times under 200ms
  - **Verify**: Use browser dev tools to check timing

### Phase 5 Checkpoint
- [x] Full stack runs: `docker compose up` works
- [x] Frontend loads: Browse to localhost:3000
- [x] Data displays: Channels and messages visible
- [x] Navigation works: Can browse between channels
- [x] **Demo ready**: Show complete working system

## Phase 6: Cleanup & Polish
**Goal**: Remove all obsolete code and finalize the implementation
**Demo**: "At standup, I can show: Clean codebase with all export code removed"

### Tasks
- [x] Task 6.1: Remove DataExportService
  - **Remove**: `backend/src/services/dataExport/*`
  - **Verify**: No imports remain

- [x] Task 6.2: Remove export worker
  - **Remove**: `backend/src/workers/exportWorker.ts`
  - **Files**: Update worker index if needed
  - **Verify**: Worker not referenced

- [x] Task 6.3: Remove export routes
  - **Remove**: `backend/src/routes/export.ts`
  - **Files**: `backend/src/routes/index.ts`
  - **Verify**: Route not mounted

- [x] Task 6.4: Remove export scripts
  - **Remove**: `backend/scripts/export-cli.ts`, `backend/scripts/build-all-tenants.ts`
  - **Remove**: `scripts/export-full.js`
  - **Verify**: Scripts deleted

- [x] Task 6.5: Clean package.json scripts
  - **Output**: Remove export-related scripts
  - **Files**: `package.json`, `backend/package.json`, `frontend/package.json`
  - **Remove**: export:*, build:tenant, build:all scripts
  - **Verify**: No export scripts remain

- [x] Task 6.6: Remove _data directory
  - **Remove**: `_data/*`
  - **Verify**: Directory deleted

- [x] Task 6.7: Update documentation
  - **Output**: README reflects new architecture
  - **Files**: `README.md`, `CLAUDE.md`
  - **Remove**: Export instructions
  - **Verify**: Docs describe API approach

### Phase 6 Checkpoint
- [x] Run lint: `npm run lint` (no errors)
- [x] Run build: `cd backend && npm run build`
- [x] Run tests: `cd backend && npm test`
- [x] No dead code: Search for "export" references
- [x] **Demo ready**: Show clean, working codebase

## Final Verification
- [x] All requirements from design doc met
- [x] All obsolete code removed
- [x] Single `docker compose up` starts everything
- [x] Frontend shows correct tenant data
- [x] API responds to all endpoints
- [x] No permission issues or volume mounts
- [x] Documentation updated