# TiDB Migration Requirements

## Problem Statement
The Verta application currently uses PostgreSQL as its primary database. We need to migrate to TiDB, a distributed SQL database that offers better horizontal scalability and is designed for handling massive data volumes with high availability. Since the application hasn't launched yet, we can perform a clean switch without maintaining backward compatibility or preserving existing data.

## Current State
The application currently uses:
- **PostgreSQL 16** running in Docker container
- **Kysely** as the query builder with PostgreSQL dialect
- **pg** (node-postgres) as the database driver
- PostgreSQL-specific features including:
  - `gen_random_uuid()` for UUID generation
  - `jsonb` data type for metadata storage
  - `ON CONFLICT` clauses for upserts
  - `pg_isready` for health checks
  - Foreign key constraints with cascade operations

## Functional Requirements

- **REQ-001**: The system SHALL completely replace PostgreSQL with TiDB
- **REQ-002**: The system SHALL support re-syncing all Discord data from scratch
- **REQ-003**: The system SHALL maintain transaction guarantees for data consistency
- **REQ-004**: All foreign key relationships SHALL be recreated in TiDB
- **REQ-005**: The system SHALL NOT maintain any PostgreSQL compatibility code

## Non-Functional Requirements

- **Performance**: Query performance should match or exceed current PostgreSQL implementation
- **Security**: Maintain existing authentication and authorization patterns
- **Simplicity**: Remove all PostgreSQL-specific code and dependencies
- **Scalability**: Support horizontal scaling without manual sharding
- **Development**: Minimize code complexity by removing dual-database support

## Constraints

- TiDB is MySQL-compatible, not PostgreSQL-compatible
- All PostgreSQL-specific functions need MySQL alternatives
- JSONB type must be converted to JSON in TiDB
- UUID generation strategy needs complete replacement
- Test infrastructure must be rebuilt for MySQL

## Success Criteria

- All tests pass with TiDB backend only
- Zero PostgreSQL code remains in codebase
- Fresh Discord sync completes successfully
- Database can handle future growth to millions of messages
- Development environment runs entirely on TiDB

## Migration Strategy

### Phase 1: Environment Setup
- Set up TiDB in Docker for development
- Configure connection parameters
- Test basic connectivity

### Phase 2: Schema Migration
- Convert PostgreSQL schema to TiDB-compatible DDL
- Replace PostgreSQL-specific data types
- Recreate all foreign key constraints

### Phase 3: Code Migration
- Replace PostgreSQL dialect with MySQL dialect in Kysely
- Update all database queries for MySQL compatibility
- Replace UUID generation strategy
- Update upsert operations

### Phase 4: Testing Infrastructure
- Update test containers to use TiDB
- Modify test setup/teardown procedures
- Update CI/CD pipelines

### Phase 5: Cleanup
- Remove PostgreSQL dependencies
- Remove PostgreSQL Docker configuration
- Update documentation

### Phase 6: Verification
- Perform fresh Discord sync
- Validate all data integrity
- Performance testing