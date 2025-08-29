# Requirements Document

## Introduction

This feature replaces the static JSON export system with a REST API that serves content directly from the database, and containerizes the frontend with runtime tenant configuration. The current system generates JSON files for each tenant's data, requiring full rebuilds whenever data changes. Each tenant needs a separate Next.js build, and the frontend runs outside Docker causing permission issues. This new approach enables real-time data updates, simplifies deployment, and eliminates complex permission management.

## Requirements

### Requirement 1

**User Story:** As a system administrator, I want content served via REST API from the database, so that data updates are available immediately without rebuilding static files.

#### Acceptance Criteria

1. WHEN a user requests content THEN the system SHALL provide REST endpoints for all content currently served via static files
2. WHEN API endpoints are called THEN the system SHALL fetch content directly from the database for each request
3. WHEN message or thread listings are requested THEN the API SHALL support pagination with configurable page size
4. WHEN the API returns data THEN response time SHALL be under 200ms for 95th percentile of requests
5. WHEN errors occur THEN the API SHALL return errors in RFC 7807 Problem Details format

### Requirement 2

**User Story:** As a frontend developer, I want the frontend to run in a Docker container with hot-reload, so that development environment matches production and avoids permission issues.

#### Acceptance Criteria

1. WHEN developing locally THEN the frontend SHALL run in a Docker container with hot-reload capability
2. WHEN the frontend starts THEN it SHALL identify its tenant via NEXT_PUBLIC_TENANT_SLUG environment variable
3. WHEN making API requests THEN the frontend SHALL include tenant identification via X-Tenant-Slug header
4. WHEN running docker-compose up THEN the entire development environment SHALL start without permission errors
5. WHEN files are modified THEN changes SHALL reflect immediately without container restart

### Requirement 3

**User Story:** As a tenant operator, I want a single frontend build to serve different tenants, so that deployment is simplified and maintenance overhead is reduced.

#### Acceptance Criteria

1. WHEN deploying the frontend THEN a single build SHALL serve different tenants based on runtime configuration
2. WHEN the frontend is configured THEN tenant identification SHALL use NEXT_PUBLIC_TENANT_SLUG environment variable
3. WHEN switching tenants THEN only environment variable changes SHALL be required, not rebuilds
4. WHEN multiple tenants are deployed THEN each SHALL see only their own data based on header validation
5. WHEN tenant configuration is missing THEN the system SHALL return appropriate error messages

### Requirement 4

**User Story:** As a public user, I want to access archived content without authentication, so that the archive remains publicly accessible as intended.

#### Acceptance Criteria

1. WHEN accessing content endpoints THEN they SHALL be publicly accessible without authentication
2. WHEN making cross-origin requests THEN the API SHALL have permissive CORS configuration allowing all origins
3. WHEN request volume is high THEN rate limiting SHALL protect the API (1000 requests/minute per IP)
4. WHEN accessing content THEN users SHALL only see data for the tenant specified in the request header
5. WHEN the tenant header is missing THEN the API SHALL return a 400 Bad Request error

### Requirement 5

**User Story:** As a developer, I want all export-related code removed, so that the codebase is clean and maintainable without obsolete functionality.

#### Acceptance Criteria

1. WHEN the migration is complete THEN all DataExportService code SHALL be removed from the codebase
2. WHEN reviewing scripts THEN all export-related CLI tools and build scripts SHALL be deleted
3. WHEN checking docker-compose THEN shared volume mounts and permission workarounds SHALL be eliminated
4. WHEN examining the filesystem THEN the _data directory SHALL no longer exist
5. WHEN running the application THEN no export workers or routes SHALL be registered

## Non-Functional Requirements

### Performance Requirements
- Database query response time SHALL be under 200ms for 95th percentile
- API endpoints SHALL handle at least 100 concurrent requests
- Frontend hot-reload SHALL reflect changes within 2 seconds
- Docker container startup SHALL complete within 30 seconds

### Security Requirements
- Rate limiting SHALL be enforced at 1000 requests/minute per IP address
- CORS SHALL allow all origins for public accessibility
- Input validation SHALL use existing Zod schemas
- Tenant isolation SHALL be enforced via slug validation
- No authentication SHALL be required for content endpoints

### Usability Requirements
- RESTful URL patterns SHALL follow existing conventions
- Error messages SHALL use RFC 7807 Problem Details format
- API responses SHALL include pagination metadata
- Frontend SHALL display user-friendly error messages
- Single docker-compose up command SHALL start entire environment

### Scalability Requirements
- Database connection pooling SHALL support concurrent requests
- API SHALL be stateless for horizontal scaling
- Frontend container SHALL support multiple instances
- Rate limiting SHALL work across multiple API instances
- System SHALL handle growth to 50+ tenants

## Constraints

- Must maintain compatibility with existing database schema
- Must follow existing service/repository patterns in backend
- Must preserve multi-tenant architecture
- Must use Next.js App Router for frontend
- Must containerize all services for consistent deployment
- No backwards compatibility needed as application is not yet live

## Success Criteria

1. All export-related code removed from codebase
2. Content served via REST API directly from database
3. Frontend running in Docker with hot-reload for development
4. Data updates visible immediately after sync completes
5. Single docker-compose up starts entire development environment
6. All permission management cruft removed (_data directory, chmod/chown workarounds)
7. Simplified deployment without build-time data requirements
8. Single frontend build serves multiple tenants via runtime configuration