# Implementation Tasks: Question Cluster Create and Delete Actions

## Overview
We're adding manual cluster creation and deletion capabilities to the question clustering system. This includes single and bulk operations through the admin interface. The implementation will be done in 4 phases, progressing from backend API endpoints to full UI integration with bulk operations.

## Phase 1: Backend API - Single Operations
**Goal**: Implement create and delete endpoints for individual clusters
**Demo**: "At standup, I can show: Creating and deleting clusters via Postman/curl with proper validation and cascade behavior"

### Tasks
- [ ] Task 1.1: Add POST endpoint for cluster creation
  - **Output**: New endpoint that creates clusters with embeddings
  - **Files**: `/backend/src/routes/api/admin/clusters.ts`
  - **Verify**: POST to `/api/admin/clusters` returns 201 with cluster object

- [ ] Task 1.2: Integrate ML service for embedding generation
  - **Depends on**: 1.1
  - **Output**: Embeddings generated from representative text + example questions
  - **Files**: `/backend/src/routes/api/admin/clusters.ts`
  - **Verify**: Created clusters have valid embedding vectors

- [ ] Task 1.3: Add DELETE endpoint for single cluster
  - **Output**: Endpoint that hard deletes clusters with cascade
  - **Files**: `/backend/src/routes/api/admin/clusters.ts`
  - **Verify**: DELETE to `/api/admin/clusters/:id` returns 204, cluster and instances removed

- [ ] Task 1.4: Add integration tests for single operations
  - **Depends on**: 1.1, 1.3
  - **Output**: Test coverage for create/delete endpoints
  - **Files**: `/backend/src/routes/api/admin/__tests__/clusters.integration.test.ts`
  - **Verify**: Tests pass and cover validation, success, and error cases

### Phase 1 Checkpoint
- [ ] Run lint: `npm run lint`
- [ ] Run build: `npm run build`
- [ ] Run tests: `npm test`
- [ ] Manual verification: Create cluster with example questions, verify embedding, delete and confirm cascade
- [ ] **Demo ready**: Show API working with proper validation, embedding generation, and cascade deletion

## Phase 2: Frontend Integration - Single Operations
**Goal**: Add UI for creating and deleting individual clusters
**Demo**: "At standup, I can show: Creating clusters through a modal form and deleting from the detail page with confirmation"

### Tasks
- [ ] Task 2.1: Add API client methods
  - **Output**: Frontend API methods for create/delete
  - **Files**: `/frontend/lib/admin/api.ts`
  - **Verify**: Methods properly typed and handle errors

- [ ] Task 2.2: Create cluster creation modal component
  - **Depends on**: 2.1
  - **Output**: Modal with form for all cluster fields including example questions
  - **Files**: `/frontend/components/admin/CreateClusterModal.tsx`
  - **Verify**: Modal opens, validates input, shows dynamic question fields

- [ ] Task 2.3: Add create button to clusters list page
  - **Depends on**: 2.2
  - **Output**: Button that opens creation modal and refreshes list
  - **Files**: `/frontend/pages/admin/index.tsx`
  - **Verify**: Click button → modal opens → create → list updates

- [ ] Task 2.4: Add delete button to cluster detail page
  - **Depends on**: 2.1
  - **Output**: Delete button with confirmation dialog
  - **Files**: `/frontend/pages/admin/clusters/[id].tsx`
  - **Verify**: Delete shows confirmation → deletes → redirects to list

### Phase 2 Checkpoint
- [ ] Run lint: `npm run lint`
- [ ] Run build: `npm run build`
- [ ] Manual verification: Full create/delete flow through UI
- [ ] **Demo ready**: Create cluster with example questions, view it, delete it - all through UI

## Phase 3: Backend API - Bulk Operations
**Goal**: Add bulk deletion capability for up to 10 clusters
**Demo**: "At standup, I can show: Bulk deleting multiple clusters with detailed success/failure results"

### Tasks
- [ ] Task 3.1: Add bulk delete endpoint
  - **Output**: POST endpoint for bulk cluster deletion
  - **Files**: `/backend/src/routes/api/admin/clusters.ts`
  - **Verify**: POST to `/api/admin/clusters/bulk-delete` processes array

- [ ] Task 3.2: Add bulkDelete repository method
  - **Depends on**: 3.1
  - **Output**: Efficient bulk deletion with transaction support
  - **Files**: `/backend/src/repositories/QuestionClusterRepository.ts`
  - **Verify**: Method handles mixed success/failure cases

- [ ] Task 3.3: Add bulk operation tests
  - **Depends on**: 3.1, 3.2
  - **Output**: Test coverage for bulk scenarios
  - **Files**: `/backend/src/routes/api/admin/__tests__/clusters.integration.test.ts`
  - **Verify**: Tests cover partial success, validation, and limits

### Phase 3 Checkpoint
- [ ] Run lint: `npm run lint`
- [ ] Run build: `npm run build`
- [ ] Run tests: `npm test`
- [ ] Manual verification: Bulk delete via API with various scenarios
- [ ] **Demo ready**: Show bulk API handling mixed valid/invalid IDs with detailed results

## Phase 4: Frontend Integration - Bulk Operations
**Goal**: Complete UI for bulk cluster management
**Demo**: "At standup, I can show: Selecting multiple clusters and bulk deleting them with result summary"

### Tasks
- [ ] Task 4.1: Add bulk delete API method
  - **Output**: Frontend API method for bulk deletion
  - **Files**: `/frontend/lib/admin/api.ts`
  - **Verify**: Method handles array and returns results

- [ ] Task 4.2: Add selection UI to cluster list
  - **Depends on**: 4.1
  - **Output**: Checkboxes and selection state management
  - **Files**: `/frontend/pages/admin/index.tsx`
  - **Verify**: Can select/deselect clusters, max 10 limit enforced

- [ ] Task 4.3: Add bulk delete button and confirmation
  - **Depends on**: 4.2
  - **Output**: Button with impact summary dialog
  - **Files**: `/frontend/pages/admin/index.tsx`
  - **Verify**: Shows selected count, confirms, processes deletion

- [ ] Task 4.4: Add result notification handling
  - **Depends on**: 4.3
  - **Output**: Success/error summary after bulk operation
  - **Files**: `/frontend/pages/admin/index.tsx`
  - **Verify**: Shows which succeeded/failed with reasons

### Phase 4 Checkpoint
- [ ] Run lint: `npm run lint`
- [ ] Run build: `npm run build`
- [ ] Manual verification: Full bulk selection and deletion flow
- [ ] **Demo ready**: Select 5 clusters, bulk delete, see detailed results

## Final Verification
- [ ] All requirements from design doc met
- [ ] All obsolete code removed (none in this case - purely additive)
- [ ] Tests comprehensive (unit + integration)
- [ ] Documentation updated (API docs if applicable)
- [ ] Manual testing of all workflows:
  - [ ] Create cluster with only required fields
  - [ ] Create cluster with example questions
  - [ ] Delete cluster with instances (verify cascade)
  - [ ] Bulk delete mixed valid/invalid IDs
  - [ ] Error handling for all edge cases