# Multi-Tenant System Design Document

## Overview

This design document outlines the architecture for transforming the existing Express.js application into a multi-tenant system with secure CRUD operations for tenant management. The system will use PostgreSQL with Kysely ORM for data persistence, Zod for validation, and implement API key-based authentication for administrative operations.

## Architecture

### High-Level Architecture

```mermaid
graph TB
    Client[Admin Client] --> Auth[Authentication Middleware]
    Auth --> Routes[Tenant Routes]
    Routes --> Validation[Zod Validation]
    Validation --> Service[Tenant Service]
    Service --> Repository[Tenant Repository]
    Repository --> Kysely[Kysely ORM]
    Kysely --> PostgreSQL[(PostgreSQL Database)]

    subgraph "Express Application"
        Auth
        Routes
        Validation
        Service
        Repository
    end
```

### Technology Stack

- **Runtime**: Node.js 24+ with TypeScript and ESM modules
- **Web Framework**: Express.js 5.x
- **Database**: PostgreSQL (latest)
- **ORM**: Kysely for type-safe database operations
- **Validation**: Zod for schema validation
- **Authentication**: API Key-based authentication
- **Testing**: Vitest for unit and integration tests
- **Containerization**: Docker with docker-compose

## Components and Interfaces

### 1. Database Schema

```typescript
// Database table structure
interface TenantsTable {
  id: string; // UUID primary key
  name: string; // Tenant display name
  slug: string; // URL-friendly unique identifier
  status: 'ACTIVE' | 'CANCELLED' | 'MAINTENANCE'; // Tenant status
  platform: 'slack' | 'discord'; // Integration platform
  platform_id: string; // Platform-specific identifier
  created_at: Date; // Creation timestamp
  updated_at: Date; // Last update timestamp
}
```

### 2. API Endpoints

```typescript
// Tenant CRUD endpoints
GET    /api/tenants          // List all tenants (with pagination)
GET    /api/tenants/:id      // Get specific tenant
POST   /api/tenants          // Create new tenant
PATCH  /api/tenants/:id      // Update tenant (partial update)
DELETE /api/tenants/:id      // Delete tenant
```

### 3. Authentication Middleware

```typescript
interface AuthMiddleware {
  validateApiKey(req: Request, res: Response, next: NextFunction): void;
}

// Environment configuration with Zod validation
const ConfigSchema = z.object({
  ADMIN_API_KEY: z.string().min(1),
  DATABASE_URL: z.string().url(),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
});

type Config = z.infer<typeof ConfigSchema>;
```

### 4. Service Layer Architecture

#### Base CRUD Service

```typescript
interface BaseCrudService<T, CreateData, UpdateData> {
  getAll(pagination?: PaginationOptions): Promise<PaginatedResult<T>>;
  getById(id: string): Promise<T | null>;
  create(data: CreateData): Promise<T>;
  update(id: string, data: UpdateData): Promise<T | null>;
  delete(id: string): Promise<boolean>;
}

abstract class BaseCrudServiceImpl<T, CreateData, UpdateData>
  implements BaseCrudService<T, CreateData, UpdateData>
{
  constructor(
    protected repository: BaseCrudRepository<T, CreateData, UpdateData>
  ) {}

  async getAll(pagination?: PaginationOptions): Promise<PaginatedResult<T>> {
    return this.repository.findAll(pagination);
  }

  async getById(id: string): Promise<T | null> {
    return this.repository.findById(id);
  }

  async create(data: CreateData): Promise<T> {
    await this.validateCreate(data);
    return this.repository.create(data);
  }

  async update(id: string, data: UpdateData): Promise<T | null> {
    await this.validateUpdate(id, data);
    return this.repository.update(id, data);
  }

  async delete(id: string): Promise<boolean> {
    return this.repository.delete(id);
  }

  protected abstract validateCreate(data: CreateData): Promise<void>;
  protected abstract validateUpdate(
    id: string,
    data: UpdateData
  ): Promise<void>;
}
```

#### Tenant Service

```typescript
interface TenantService
  extends BaseCrudService<Tenant, CreateTenantRequest, UpdateTenantRequest> {
  // Tenant-specific methods
  findBySlug(slug: string): Promise<Tenant | null>;
  findByPlatformId(
    platform: string,
    platformId: string
  ): Promise<Tenant | null>;
  validateUniqueSlug(slug: string, excludeId?: string): Promise<boolean>;
  validateUniquePlatformId(
    platform: string,
    platformId: string,
    excludeId?: string
  ): Promise<boolean>;
}

class TenantServiceImpl
  extends BaseCrudServiceImpl<Tenant, CreateTenantRequest, UpdateTenantRequest>
  implements TenantService
{
  constructor(private tenantRepository: TenantRepository) {
    super(tenantRepository);
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    return this.tenantRepository.findBySlug(slug);
  }

  async findByPlatformId(
    platform: string,
    platformId: string
  ): Promise<Tenant | null> {
    return this.tenantRepository.findByPlatformId(platform, platformId);
  }

  protected async validateCreate(data: CreateTenantRequest): Promise<void> {
    // Implement tenant-specific creation validation
    await this.validateUniqueSlug(data.slug || this.generateSlug(data.name));
    await this.validateUniquePlatformId(data.platform, data.platformId);
  }

  protected async validateUpdate(
    id: string,
    data: UpdateTenantRequest
  ): Promise<void> {
    // Implement tenant-specific update validation
    if (data.slug) {
      await this.validateUniqueSlug(data.slug, id);
    }
    if (data.platform && data.platformId) {
      await this.validateUniquePlatformId(data.platform, data.platformId, id);
    }
  }

  // Additional tenant-specific methods...
}
```

### 5. Repository Layer Architecture

#### Base CRUD Repository

```typescript
interface BaseCrudRepository<T, CreateData, UpdateData> {
  findAll(pagination?: PaginationOptions): Promise<PaginatedResult<T>>;
  findById(id: string): Promise<T | null>;
  create(data: CreateData): Promise<T>;
  update(id: string, data: UpdateData): Promise<T | null>;
  delete(id: string): Promise<boolean>;
}

abstract class BaseCrudRepositoryImpl<T, CreateData, UpdateData>
  implements BaseCrudRepository<T, CreateData, UpdateData>
{
  constructor(
    protected db: Kysely<Database>,
    protected tableName: string
  ) {}

  async findAll(pagination?: PaginationOptions): Promise<PaginatedResult<T>> {
    const {
      page = 1,
      limit = 10,
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = pagination || {};
    const offset = (page - 1) * limit;

    const [data, countResult] = await Promise.all([
      this.db
        .selectFrom(this.tableName as any)
        .selectAll()
        .orderBy(sortBy as any, sortOrder)
        .limit(limit)
        .offset(offset)
        .execute(),
      this.db
        .selectFrom(this.tableName as any)
        .select(this.db.fn.count('id').as('count'))
        .executeTakeFirst(),
    ]);

    const total = Number(countResult?.count || 0);
    const totalPages = Math.ceil(total / limit);

    return {
      data: data.map((row) => this.mapRowToEntity(row)),
      pagination: { page, limit, total, totalPages },
    };
  }

  async findById(id: string): Promise<T | null> {
    const row = await this.db
      .selectFrom(this.tableName as any)
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    return row ? this.mapRowToEntity(row) : null;
  }

  async create(data: CreateData): Promise<T> {
    const insertData = this.mapCreateDataToRow(data);
    const row = await this.db
      .insertInto(this.tableName as any)
      .values(insertData)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRowToEntity(row);
  }

  async update(id: string, data: UpdateData): Promise<T | null> {
    const updateData = this.mapUpdateDataToRow(data);
    const row = await this.db
      .updateTable(this.tableName as any)
      .set(updateData)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();

    return row ? this.mapRowToEntity(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom(this.tableName as any)
      .where('id', '=', id)
      .executeTakeFirst();

    return Number(result.numDeletedRows) > 0;
  }

  protected abstract mapRowToEntity(row: any): T;
  protected abstract mapCreateDataToRow(data: CreateData): any;
  protected abstract mapUpdateDataToRow(data: UpdateData): any;
}
```

#### Tenant Repository

```typescript
interface TenantRepository
  extends BaseCrudRepository<Tenant, CreateTenantData, UpdateTenantData> {
  findBySlug(slug: string): Promise<Tenant | null>;
  findByPlatformId(
    platform: string,
    platformId: string
  ): Promise<Tenant | null>;
}

class TenantRepositoryImpl
  extends BaseCrudRepositoryImpl<Tenant, CreateTenantData, UpdateTenantData>
  implements TenantRepository
{
  constructor(db: Kysely<Database>) {
    super(db, 'tenants');
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    const row = await this.db
      .selectFrom('tenants')
      .selectAll()
      .where('slug', '=', slug)
      .executeTakeFirst();

    return row ? this.mapRowToEntity(row) : null;
  }

  async findByPlatformId(
    platform: string,
    platformId: string
  ): Promise<Tenant | null> {
    const row = await this.db
      .selectFrom('tenants')
      .selectAll()
      .where('platform', '=', platform)
      .where('platform_id', '=', platformId)
      .executeTakeFirst();

    return row ? this.mapRowToEntity(row) : null;
  }

  protected mapRowToEntity(row: TenantsTable): Tenant {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      platform: row.platform,
      platformId: row.platform_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  protected mapCreateDataToRow(
    data: CreateTenantData
  ): Omit<TenantsTable, 'created_at' | 'updated_at'> {
    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      status: data.status,
      platform: data.platform,
      platform_id: data.platformId,
    };
  }

  protected mapUpdateDataToRow(data: UpdateTenantData): Partial<TenantsTable> {
    const updateData: Partial<TenantsTable> = {
      updated_at: new Date(),
    };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.slug !== undefined) updateData.slug = data.slug;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.platform !== undefined) updateData.platform = data.platform;
    if (data.platformId !== undefined) updateData.platform_id = data.platformId;

    return updateData;
  }
}
```

## Data Models

### Tenant Entity

```typescript
interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  platform: Platform;
  platformId: string;
  createdAt: Date;
  updatedAt: Date;
}

type TenantStatus = 'ACTIVE' | 'CANCELLED' | 'MAINTENANCE';
type Platform = 'slack' | 'discord';
```

### Request/Response Models

```typescript
interface CreateTenantRequest {
  name: string;
  slug?: string; // Optional, generated from name if not provided
  status?: TenantStatus; // Optional, defaults to ACTIVE
  platform: Platform;
  platformId: string;
}

interface UpdateTenantRequest {
  name?: string;
  slug?: string;
  status?: TenantStatus;
  platform?: Platform;
  platformId?: string;
}

interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

### Zod Validation Schemas

```typescript
const CreateTenantSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .min(1)
    .max(100)
    .optional(),
  status: z.enum(['ACTIVE', 'CANCELLED', 'MAINTENANCE']).optional(),
  platform: z.enum(['slack', 'discord']),
  platformId: z.string().min(1).max(255),
});

const UpdateTenantSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    slug: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .min(1)
      .max(100)
      .optional(),
    status: z.enum(['ACTIVE', 'CANCELLED', 'MAINTENANCE']).optional(),
    platform: z.enum(['slack', 'discord']).optional(),
    platformId: z.string().min(1).max(255).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });
```

## Error Handling

### Error Response Format

```typescript
interface ErrorResponse {
  error: string;
  message: string;
  details?: any;
  timestamp: string;
}
```

### Error Types

1. **Authentication Errors (401)**
   - Missing or invalid API key
   - Malformed authentication header

2. **Validation Errors (400)**
   - Invalid request body format
   - Missing required fields
   - Invalid field values
   - Duplicate slug or platformId

3. **Not Found Errors (404)**
   - Tenant not found by ID
   - Invalid endpoint

4. **Server Errors (500)**
   - Database connection issues
   - Unexpected application errors

### Error Handling Middleware

The application will use Express's standard error handling middleware pattern. All errors will be caught and processed by a centralized error handler that formats responses consistently.

```typescript
// Standard Express error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  // Handle different error types and return appropriate responses
});
```

## Testing Strategy

### Unit Tests

1. **Validation Tests**
   - Test all Zod schemas with valid and invalid data
   - Test edge cases for slug generation and validation

2. **Service Layer Tests**
   - Test business logic for tenant operations
   - Test unique constraint validations
   - Mock repository dependencies

3. **Repository Tests**
   - Test database operations with test database
   - Test query building and result mapping

### Integration Tests

1. **API Endpoint Tests**
   - Test all CRUD operations end-to-end
   - Test authentication middleware
   - Test error handling and response formats

2. **Database Integration Tests**
   - Test migrations and schema changes
   - Test database constraints and relationships

### Test Database Setup

- Use Testcontainers to spin up PostgreSQL instances for testing
- Implement database seeding for consistent test data
- Use transactions for test isolation
- Automatically clean up containers after test suites complete

## Security Considerations

### API Key Management

- Store API key in environment variables
- Use secure comparison to prevent timing attacks
- Consider implementing API key rotation mechanism
- Log authentication attempts for monitoring

### Input Validation

- Validate all inputs using Zod schemas
- Sanitize string inputs to prevent injection attacks
- Implement rate limiting for API endpoints
- Validate UUID format for ID parameters

### Database Security

- Use parameterized queries through Kysely
- Implement proper database user permissions
- Enable database connection encryption
- Regular security updates for dependencies

## Performance Considerations

### Database Optimization

- Add indexes on frequently queried fields (slug, platform_id)
- Implement connection pooling
- Monitor and log performance metrics

### API Performance

- Implement pagination for list endpoints
- Use compression middleware
- Monitor and log performance metrics

## Deployment Configuration

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/verta
DATABASE_POOL_SIZE=10

# Authentication
ADMIN_API_KEY=your-secure-api-key-here

# Application
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
```

### Docker Configuration

- Update docker-compose.yml to include PostgreSQL service
- Configure proper networking between services
- Set up volume persistence for database data
- Configure health checks for both services
