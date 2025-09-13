# Technical Design

## Architecture Overview

The Question Cluster Management feature extends the existing clustering system with manual CRUD operations. It leverages the existing infrastructure while adding new endpoints and UI components for cluster creation and deletion, including bulk operations.

```
[Admin UI] → [REST API] → [ClusterRepository] → [TiDB]
                ↓
          [MlClientService] → [Python ML Service]
```

## API Design

### Endpoints

#### Create Cluster
```
POST /api/admin/clusters
Authorization: X-API-KEY

Request Body:
{
  tenant_id: string (UUID),
  representative_text: string,
  thread_title?: string,
  example_questions?: string[],
  metadata?: object
}

Response: 201 Created
{
  id: string,
  tenant_id: string,
  representative_text: string,
  thread_title: string | null,
  embedding: number[],
  instance_count: 0,
  golden_answer_id: null,
  metadata: { source: 'manual', ... },
  created_at: string,
  updated_at: string
}
```

#### Delete Cluster
```
DELETE /api/admin/clusters/:id
Authorization: X-API-KEY

Response: 204 No Content
```

#### Bulk Delete Clusters
```
POST /api/admin/clusters/bulk-delete
Authorization: X-API-KEY

Request Body:
{
  cluster_ids: string[] // Max 10 UUIDs
}

Response: 200 OK
{
  results: [
    { cluster_id: string, success: true },
    { cluster_id: string, success: false, error: string }
  ],
  summary: {
    total: number,
    succeeded: number,
    failed: number
  }
}
```

## Component Design

### Backend Components

#### Route Handler Extensions
**File:** `/backend/src/routes/api/admin/clusters.ts`

Extends existing cluster routes with new endpoints:
- POST handler for cluster creation
- DELETE handler for single cluster deletion
- POST handler for bulk deletion

Key implementation details:
- Validates input using existing validation patterns
- Uses requireAdminKey middleware for authentication
- Handles errors consistently with existing endpoints

#### Repository Extensions
**File:** `/backend/src/repositories/QuestionClusterRepository.ts`

The existing repository already inherits create() and delete() from BaseCrudRepository. Only needs:
- `bulkDelete(ids: string[])` method for efficient bulk operations
- Transaction support for atomic operations

#### ML Service Integration

For embedding generation:
```typescript
// Combine texts for better embedding quality
const textsToEmbed = [
  representative_text,
  thread_title, // if provided
  ...example_questions // if provided
].filter(Boolean);

const combinedText = textsToEmbed.join(' ');
const embedding = await mlClient.embed(combinedText);
```

### Frontend Components

#### API Client Methods
**File:** `/frontend/lib/admin/api.ts`

```typescript
export async function createCluster(data: CreateClusterRequest): Promise<QuestionCluster> {
  const response = await fetchWithAuth('/api/admin/clusters', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function deleteCluster(id: string): Promise<void> {
  await fetchWithAuth(`/api/admin/clusters/${id}`, {
    method: 'DELETE',
  });
}

export async function bulkDeleteClusters(ids: string[]): Promise<BulkDeleteResult> {
  const response = await fetchWithAuth('/api/admin/clusters/bulk-delete', {
    method: 'POST',
    body: JSON.stringify({ cluster_ids: ids }),
  });
  return response.json();
}
```

#### Create Cluster Modal
**File:** `/frontend/components/admin/CreateClusterModal.tsx`

Modal component following existing patterns (similar to GoldenAnswerEditor):
- Tenant selector (required)
- Representative text input (required)
- Thread title input (optional)
- Dynamic list for example questions (optional)
- Add/remove buttons for example questions
- Loading state during submission
- Error handling with user feedback

#### UI Integration Points

**Cluster List Page** (`/frontend/pages/admin/index.tsx`):
- "Create Cluster" button in header
- Checkbox column for bulk selection
- Selection state management (max 10)
- "Delete Selected" button when items selected
- Bulk deletion confirmation modal
- Result notification handling

**Cluster Detail Page** (`/frontend/pages/admin/clusters/[id].tsx`):
- "Delete Cluster" button in actions area
- Confirmation dialog with impact summary
- Redirect to list after deletion

## Data Flow

### Create Cluster Flow
1. User fills form in CreateClusterModal
2. Frontend validates and sends POST request
3. Backend validates tenant_id and texts
4. ML service generates embedding from combined text
5. Repository creates cluster with metadata.source = 'manual'
6. Response returned to frontend
7. Modal closes and list refreshes

### Delete Cluster Flow
1. User clicks delete button
2. Confirmation modal shows impact (instances, golden answers)
3. User confirms deletion
4. Backend validates cluster exists
5. Database cascade deletes cluster and related data
6. Frontend redirects to cluster list

### Bulk Delete Flow
1. User selects multiple clusters (max 10)
2. Clicks "Delete Selected"
3. Summary modal shows selected clusters
4. User confirms bulk deletion
5. Backend processes each deletion independently
6. Results returned with success/failure per cluster
7. Frontend shows detailed results notification

## Database Considerations

### No Schema Changes
Uses existing tables with cascade constraints:
- `question_clusters` - Main cluster table
- `question_instances` - Cascade deleted via FK
- `golden_answers` - Cascade deleted via FK

### Cascade Delete Behavior
```sql
-- Existing constraints handle cleanup automatically
FOREIGN KEY (cluster_id) REFERENCES question_clusters(id) ON DELETE CASCADE
```

### Manual Cluster Identification
Clusters created manually will have:
- `instance_count` = 0 initially
- `metadata.source` = 'manual'
- Can be linked to messages later by the clustering pipeline

## Security Considerations

### Authentication
- All endpoints require X-API-KEY header
- Uses existing requireAdminKey middleware
- No tenant-based restrictions for admins

### Input Validation
- UUID format validation for IDs
- Text length limits
- Array size limits (max 10 for bulk)
- XSS prevention in text fields

### Rate Limiting
- Bulk operations limited to 10 items
- Standard API rate limits apply
- No additional restrictions needed

## Error Handling

### API Errors
- 400 Bad Request - Invalid input
- 401 Unauthorized - Missing/invalid API key
- 404 Not Found - Cluster doesn't exist
- 500 Internal Server Error - Unexpected errors

### Frontend Error Display
- Form validation errors inline
- API errors in toast notifications
- Bulk operation results in detailed modal

## Testing Strategy

### Unit Tests
- Repository methods with mocked database
- Route handlers with mocked services
- Frontend components with mocked API

### Integration Tests
- Full API flow with test database
- Cascade deletion verification
- Bulk operation edge cases

### E2E Test Scenarios
- Create cluster with all fields
- Create cluster with minimal fields
- Delete cluster with instances
- Bulk delete mixed valid/invalid
- UI interaction flows

## Performance Considerations

### Bulk Operations
- Process in single transaction when possible
- Return partial results on failure
- Limit to 10 items to prevent timeouts

### Embedding Generation
- Single ML service call per cluster
- Combine texts before embedding
- No batch optimization needed for manual creation

### UI Responsiveness
- Optimistic updates where appropriate
- Loading states during operations
- Debounced form inputs

## Monitoring and Observability

### Metrics to Track
- Cluster creation rate
- Deletion frequency
- Bulk operation sizes
- Error rates by type
- Embedding generation time

### Logging
- Admin actions for audit trail
- Error details for debugging
- Performance metrics

## Rollout Strategy

### Deployment Order
1. Backend changes (backwards compatible)
2. Frontend with feature flag
3. Enable for internal testing
4. Gradual admin rollout
5. Monitor cascade delete impact

### Feature Flags
- `ENABLE_MANUAL_CLUSTERS` - Create functionality
- `ENABLE_CLUSTER_DELETE` - Delete functionality
- `ENABLE_BULK_DELETE` - Bulk operations

### Rollback Plan
- Features are additive
- Can disable via feature flags
- No data migrations to revert