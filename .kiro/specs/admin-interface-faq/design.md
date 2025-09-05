# Admin Interface and FAQ Design

## Architecture Overview

The admin interface and FAQ feature integrate into the existing Next.js frontend with basic auth protection. The architecture uses an integrated approach for simplicity while maintaining security through authentication at both API and frontend layers.

```
         ┌─────────────────────────┐
         │    Next.js Frontend     │
         ├─────────────┬───────────┤
         │ Public Pages│Admin Pages│
         │  /          │  /admin/* │
         │  /faq       │ (Protected)│
         └─────────────┴───────────┘
                  │
                  │ Basic Auth on /admin
                  ▼
┌─────────────────────────────────────────┐
│           Backend API (Express)         │
├─────────────┬───────────────────────────┤
│  Public Routes  │   Admin Routes        │
│  /api/v1/*      │   /api/admin/*        │
│                 │   (Basic Auth)         │
└─────────────┴───────────────────────────┘
                  │
                  ▼
         ┌────────────────┐
         │   TiDB Database │
         │  + golden_answers│
         └────────────────┘
```

## Key Components

### Backend Service
- **Admin Cluster Routes** (`/api/admin/clusters`): RESTful endpoints for cluster management
- **Golden Answer Repository**: CRUD operations extending BaseCrudRepository pattern
- **Public FAQ Endpoint** (`/api/v1/faq`): Cached endpoint for public FAQ data
- **Basic Auth Middleware**: Reused from Bull Board implementation

### Frontend Components
- **Admin Layout**: Protected layout wrapper for admin pages
- **Cluster List Page**: Paginated view of all clusters
- **Cluster Detail Page**: Individual cluster with instances and golden answer editor
- **Golden Answer Editor**: Markdown editor with preview (basic markdown only)
- **FAQ Page**: Static generated page with ordered Q&As
- **Inline Text Editor**: Edit representative text directly in cluster details

### Database Schema

```sql
CREATE TABLE golden_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID NOT NULL REFERENCES question_clusters(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  answer TEXT NOT NULL,
  answer_format VARCHAR(20) DEFAULT 'markdown',
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(cluster_id)
);

CREATE INDEX idx_golden_answers_tenant ON golden_answers(tenant_id);
CREATE INDEX idx_golden_answers_cluster ON golden_answers(cluster_id);
```

## API Specification

### Admin Endpoints

```typescript
GET /api/admin/clusters
  Query: { tenant_id?, page?, limit?, sort_by?, sort_order? }
  Response: { data: Cluster[], pagination: {...} }

GET /api/admin/clusters/:id
  Response: { cluster: Cluster, golden_answer?: GoldenAnswer, instances: Instance[] }

POST /api/admin/clusters/:id/golden-answer
  Body: { answer: string, answer_format: 'markdown', created_by: string }
  Response: { golden_answer: GoldenAnswer }

DELETE /api/admin/clusters/:id/golden-answer
  Response: { message: string }

PATCH /api/admin/clusters/:id
  Body: { representative_text?: string }
  Response: { cluster: Cluster }
```

### Public Endpoints

```typescript
GET /api/v1/faq
  Response: { 
    faqs: Array<{
      question: string,
      answer: string,
      answer_format: string,
      instance_count: number
    }>
  }
```

## Security Implementation

### Authentication Flow
1. **Frontend Protection**: Next.js middleware intercepts `/admin` routes
2. **Basic Auth Challenge**: Returns 401 with WWW-Authenticate header
3. **Credential Validation**: Checks username="admin" and password=ADMIN_API_KEY
4. **API Protection**: Backend validates X-API-Key header for admin endpoints
5. **Session Management**: Browser caches Basic Auth credentials

### Markdown Sanitization
- **Allowed Elements**: Bold, italic, links, lists only
- **Sanitization Library**: rehype-sanitize with strict schema
- **XSS Prevention**: All user input sanitized before storage and rendering

## Data Flow

### Admin Workflow
1. Admin navigates to `/admin` → Basic auth prompt
2. Credentials validated → Admin dashboard loads
3. Clusters fetched with pagination → Display sorted by instance count
4. Admin selects cluster → Details with instances loaded
5. Admin adds/edits golden answer → Saved to database
6. Admin edits representative text → Updated inline

### Public FAQ Flow
1. User visits `/faq` → No authentication required
2. Static props fetch FAQ data at build time
3. Clusters with golden answers retrieved → Ordered by popularity
4. Simple list rendered → Basic markdown displayed

## Integration Points

### With Question Clustering System
- Reads from `question_clusters` table
- Reads from `question_instances` table
- Maintains foreign key relationships
- Preserves existing clustering logic

### With Tenant System
- All queries filtered by tenant_id
- Golden answers isolated per tenant
- FAQ displays tenant-specific content

### With Static Export
- FAQ data fetched at build time
- Cached for performance
- Regenerated on new builds

## Technical Decisions

### Integrated Frontend Approach
**Decision**: Admin interface within main frontend
**Rationale**: Simplicity, reduced infrastructure, easier deployment
**Trade-offs**: Less isolation, shared resources

### Single Version Storage
**Decision**: No version history for golden answers
**Rationale**: Simplicity, reduced complexity
**Trade-offs**: No audit trail, no rollback capability

### Basic Markdown Only
**Decision**: Limited markdown support (bold, italic, lists, links)
**Rationale**: Security, prevent XSS attacks
**Trade-offs**: Less rich formatting options

### Simple List Display
**Decision**: FAQ as ordered list without search or categories
**Rationale**: MVP simplicity, quick implementation
**Trade-offs**: Less discoverability for many questions

### Inline Text Editing
**Decision**: Representative text editable inline
**Rationale**: Better UX, immediate feedback
**Trade-offs**: More complex UI state management