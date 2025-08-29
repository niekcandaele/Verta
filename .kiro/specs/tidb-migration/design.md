# TiDB Migration Design

## Overview

This design document outlines the complete migration from PostgreSQL to TiDB for the Verta application. TiDB is a distributed SQL database that offers better horizontal scalability and is designed for handling massive data volumes with high availability. Since the application hasn't launched yet, we perform a clean switch without maintaining backward compatibility.

## Architecture

### High-Level Migration Architecture

```mermaid
graph TB
    subgraph "Current State"
        PG[PostgreSQL 16]
        Kysely1[Kysely + PG Dialect]
        PGDriver[node-postgres]
    end
    
    subgraph "Target State"
        TiDB[TiDB Cluster]
        Kysely2[Kysely + MySQL Dialect]
        MySQLDriver[mysql2]
    end
    
    Migration[Migration Process]
    PG --> Migration
    Migration --> TiDB
    Kysely1 --> Migration
    Migration --> Kysely2
    PGDriver --> Migration
    Migration --> MySQLDriver
```

## Functional Specification

### User Workflows
1. **Fresh Discord Sync**
   - System connects to TiDB → Creates empty schema → Syncs all Discord data → No migration needed
   
2. **Development Workflow**
   - Developer runs docker compose → TiDB starts → Migrations create schema → Ready for development

3. **Testing Workflow**
   - Tests spin up TiDB container → Run migrations → Execute tests → Teardown

### External Interfaces
- Database URL: `mysql://user:password@tidb:4000/verta`
- Health endpoint: MySQL ping instead of pg_isready
- Migration scripts: Pure MySQL DDL syntax

### Alternatives Considered
| Option | Pros | Cons | Why Not Chosen |
|--------|------|------|----------------|
| Maintain dual support | Flexibility for future | Complex codebase, unnecessary | No production data to preserve |
| Use compatibility layer | Easier migration | Performance overhead, complexity | Clean switch is simpler |
| TiDB PostgreSQL mode | Minimal code changes | Experimental, not production ready | MySQL mode is stable |

## Layer 3: Technical Specification

### Architecture
```
Before (Remove):                 After (Implement):
┌─────────────┐                  ┌─────────────┐
│   Express   │                  │   Express   │
│     App     │                  │     App     │
└──────┬──────┘                  └──────┬──────┘
       │                                 │
┌──────▼──────┐                  ┌──────▼──────┐
│   Kysely    │                  │   Kysely    │
│ (PG Dialect)│                  │(MySQL Dialect)
└──────┬──────┘                  └──────┬──────┘
       │                                 │
┌──────▼──────┐                  ┌──────▼──────┐
│  pg driver  │                  │ mysql2 driver│
└──────┬──────┘                  └──────┬──────┘
       │                                 │
┌──────▼──────┐                  ┌──────▼──────┐
│ PostgreSQL  │                  │    TiDB     │
└─────────────┘                  └─────────────┘
```

### Code Change Analysis
| Component | Action | Justification |
|-----------|--------|---------------|
| docker-compose.yml | Replace | Remove PostgreSQL, add TiDB service |
| backend/package.json | Replace | Remove pg/types, add mysql2 |
| src/database/index.ts | Replace | Remove PostgresDialect, add MysqlDialect |
| src/database/connection.ts | Replace | Remove pg_isready, add MySQL health check |
| migrations/*.ts | Rewrite | Convert all to MySQL syntax |
| repositories/*.ts | Modify | Update for MySQL syntax |
| test infrastructure | Replace | Remove PostgreSQL containers, add TiDB |

### Code to Remove
- **All PostgreSQL dependencies** (package.json)
  - `pg`, `@types/pg`, `@testcontainers/postgresql`
  - No replacement needed, just removal

- **PostgreSQL Docker service** (docker-compose.yml)
  - Entire postgres service block
  - postgres_data volume

- **PostgreSQL test utilities** 
  - src/test/testcontainers-setup.ts
  - PostgreSQL-specific test setup code

### Implementation Approach

#### Components

- **Docker Compose** (docker-compose.yml)
  - Remove PostgreSQL service entirely
  - Add TiDB service:
    ```
    tidb service with:
      image: pingcap/tidb:latest
      port 4000 for MySQL protocol
      port 10080 for status
      environment variables for configuration
      health check using mysqladmin ping
    ```

- **Database Connection** (backend/src/database/index.ts)
  - Complete replacement:
    ```
    Remove PostgresDialect import
    Add MysqlDialect import
    Replace Pool from pg with createPool from mysql2
    Update connection string parsing
    ```

- **Connection Management** (backend/src/database/connection.ts)
  - Replace health check:
    ```
    Remove: SELECT NOW() PostgreSQL query
    Add: SELECT 1 MySQL query
    Update error handling for MySQL errors
    ```

- **Migrations** (backend/src/database/migrations/*.ts)
  - Complete rewrite for MySQL:
    ```
    gen_random_uuid() → UUID() or app-generated
    jsonb → json
    serial → auto_increment
    timestamp defaults → MySQL syntax
    CHECK constraints → MySQL syntax
    ```

- **Repositories** (backend/src/repositories/**/*.ts)
  - UUID Generation:
    ```
    Remove: sql`gen_random_uuid()`
    Add: crypto.randomUUID() or UUID()
    ```
  - Upsert Operations:
    ```
    Remove: ON CONFLICT ... DO UPDATE
    Add: ON DUPLICATE KEY UPDATE
    ```

- **Test Infrastructure** (backend/src/test/*)
  - Complete replacement:
    ```
    Remove: PostgreSqlContainer
    Add: GenericContainer for TiDB
    Update all test database setup
    ```

#### Data Models
All models remain structurally the same, only DDL syntax changes:
- UUID columns: Use VARCHAR(36) with app-generated UUIDs
- JSON columns: Change from jsonb to json type
- Timestamps: Use MySQL DATETIME or TIMESTAMP
- Foreign keys: Maintain same relationships with MySQL syntax

#### Security
- TLS configuration for TiDB connections
- MySQL user/grant system instead of PostgreSQL roles
- Same environment variable pattern for credentials

### Testing Strategy
- Unit tests: No changes needed (mocked)
- Integration tests: 
  - Use TiDB test container
  - Rewrite database setup utilities
  - Same test cases, different backend
- Fresh sync test: Verify complete Discord import works

### Rollout Plan
Since this is pre-launch with no production data:

**Day 1: Development Environment**
1. Stop and remove PostgreSQL container
2. Add TiDB to docker-compose
3. Install mysql2, remove pg packages
4. Update database connection code
5. Rewrite all migrations
6. Test basic connectivity

**Day 2: Repository Updates**
1. Update all repository classes
2. Fix UUID generation
3. Convert upsert operations
4. Test CRUD operations

**Day 3: Test Infrastructure**
1. Replace test containers
2. Update test setup utilities
3. Run full test suite
4. Fix any failing tests

**Day 4: Fresh Sync**
1. Clear any existing data
2. Run fresh Discord sync
3. Verify data integrity
4. Performance testing

**No Rollback Needed**: Since we're discarding all data and doing a clean switch, no rollback plan is necessary. If issues arise, we fix forward.