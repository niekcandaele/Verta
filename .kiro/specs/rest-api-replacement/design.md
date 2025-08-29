# Technical Design: REST API Replacement

## Architecture Overview

```
Development Environment:
┌─────────────────────────────────────────────────────────────┐
│                     Docker Compose Network                   │
├─────────────────┬────────────────┬────────────┬────────────┤
│   Frontend      │   Backend API   │   Redis    │   TiDB     │
│  Container      │   Container     │  Container │ Container  │
│ (Next.js SSR)   │  (Express API)  │  (BullMQ)  │ (Database) │
│  Port: 3000     │   Port: 25000   │ Port: 6379 │ Port: 4000 │
│  Volume: ./src  │  Volume: ./src  │            │            │
│ Env: NEXT_PUBLIC│                 │            │            │
│ _TENANT_SLUG    │                 │            │            │
└─────────────────┴────────────────┴────────────┴────────────┘

API Flow:
Frontend (with tenant context) → API Gateway → Service Layer → Repository → Database

Tenant Resolution:
1. Frontend reads NEXT_PUBLIC_TENANT_SLUG from environment
2. Frontend includes tenant slug in X-Tenant-Slug header for all API requests
3. API validates tenant exists and fetches tenant-specific data from database
```

## API Design

### REST Endpoints

All endpoints require the `X-Tenant-Slug` header:

```
GET /api/v1/tenant
GET /api/v1/channels
GET /api/v1/channels/:channelId
GET /api/v1/channels/:channelId/messages?page=1&limit=50
GET /api/v1/channels/:channelId/threads?page=1&limit=20
GET /api/v1/channels/:channelId/threads/:threadId/messages
GET /api/v1/branding

Headers:
  X-Tenant-Slug: <tenant-slug>
```

### Response Formats

**Success Response:**
```json
{
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 500,
    "totalPages": 10
  }
}
```

**Error Response (RFC 7807):**
```json
{
  "type": "/errors/missing-tenant",
  "title": "Missing Tenant Header",
  "status": 400,
  "detail": "The X-Tenant-Slug header is required for all API requests"
}
```

## Implementation Components

### Backend Services

**ContentService** (`backend/src/services/content/ContentService.ts`)
- Orchestrates content delivery from database
- Extends BaseCrudService pattern
- Validates tenant slug from header
- Formats responses with pagination metadata

**Content API Routes** (`backend/src/routes/api/v1/content.ts`)
- RESTful endpoints without authentication
- Mounted at /api/v1
- Validates tenant header
- Delegates to ContentService

**CORS Middleware** (`backend/src/middleware/cors.ts`)
- Enables cross-origin requests from any origin
- Allows all headers and methods
- Supports credentials
- Applied to all API routes

### Frontend Components

**Frontend Container** (`frontend/Dockerfile`)
- Multi-stage build for dev/prod
- Development stage with hot-reload
- Production stage with optimized build
- Node 24 Alpine base image

**API Client** (`frontend/lib/api-client.ts`)
- Axios-based with tenant context
- Automatic header injection
- Error handling and retry logic
- TypeScript interfaces for responses

**Data Layer Updates** (`frontend/lib/data.ts`)
- Replace filesystem reads with API calls
- Use NEXT_PUBLIC_TENANT_SLUG for tenant context
- Handle pagination for messages
- Error boundary for API failures

### Docker Configuration

**Frontend Service** (`docker-compose.yml`)
```yaml
frontend:
  build: 
    context: ./frontend
    target: dev
  ports:
    - '3000:3000'
  volumes:
    - ./frontend:/app
    - /app/node_modules
    - /app/.next
  environment:
    - NEXT_PUBLIC_API_URL=http://localhost:25000
    - NEXT_PUBLIC_TENANT_SLUG=${TEST_DISCORD_TENANT_SLUG}
  depends_on:
    - app
```

**Database Init Container** (`docker-compose.yml`)
```yaml
db-init:
  build:
    context: ./backend
    target: dev
  volumes:
    - ./backend:/app
    - /app/node_modules
  env_file:
    - .env
  environment:
    - DATABASE_URL=mysql://root:@tidb:4000/verta
  depends_on:
    tidb:
      condition: service_healthy
  command: /app/scripts/init-db.sh
  restart: "no"
```

## Data Models

### TypeScript Interfaces

```typescript
interface ApiResponse<T> {
  data: T;
  meta: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

interface ProblemDetails {
  type?: string;      // URI reference for the problem type
  title: string;      // Short human-readable summary
  status: number;     // HTTP status code
  detail?: string;    // Human-readable explanation
  instance?: string;  // URI reference for this occurrence
}

interface TenantContext {
  slug: string;
  name: string;
  platform: 'discord' | 'slack';
  status: 'ACTIVE' | 'MAINTENANCE' | 'ARCHIVED';
}
```

## Security Considerations

### Rate Limiting
- Express-rate-limit middleware
- 1000 requests/minute per IP
- Memory store for development
- Redis store for production

### Input Validation
- Zod schemas for all inputs
- Tenant slug validation
- Channel ID format checking
- Pagination bounds checking

### Tenant Isolation
- Header-based tenant identification
- Database queries filtered by tenant
- No cross-tenant data access
- Validated on every request

## Performance Optimizations

### Database
- Connection pooling (10 connections)
- Indexed queries on tenant_id
- Pagination with LIMIT/OFFSET
- Selective field projection

### Frontend
- Server-side rendering for initial load
- Client-side navigation after hydration
- Image optimization with Next.js
- Static asset caching

### API
- Stateless for horizontal scaling
- No server-side sessions
- Lightweight JSON responses
- Compression middleware

## Migration Strategy

### Phase 1: Frontend Containerization
- Create Dockerfile with dev/prod stages
- Add to docker-compose with volumes
- Configure environment variables
- Test hot-reload functionality

### Phase 2: API Implementation
- Create ContentService
- Implement API routes
- Add CORS and rate limiting
- Deploy alongside export system

### Phase 3: Frontend Migration
- Create API client
- Update data fetching
- Remove filesystem dependencies
- Add error handling

### Phase 4: Cleanup
- Remove export services
- Delete export scripts
- Remove _data directory
- Update documentation

## Testing Approach

### Unit Tests
- ContentService business logic
- API route handlers
- Frontend components
- Utility functions

### Integration Tests
- API with database
- Frontend with API
- Docker container startup
- Environment configuration

### End-to-End Tests
- Full user workflows
- Multi-tenant scenarios
- Error conditions
- Performance under load

## Monitoring and Observability

### Metrics
- API response times
- Database query duration
- Error rates by endpoint
- Rate limit hits

### Logging
- Structured JSON logs
- Request/response logging
- Error stack traces
- Tenant context in logs

### Health Checks
- Database connectivity
- Redis availability
- API endpoint status
- Frontend build status