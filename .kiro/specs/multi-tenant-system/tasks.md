# Implementation Plan

- [x] 1. Set up project dependencies and configuration
  - Install required packages: kysely, pg, zod, testcontainers
  - Update package.json with new dependencies
  - Create environment configuration with Zod validation
  - _Requirements: 9.1, 10.1_

- [x] 2. Configure PostgreSQL and Docker setup
  - Update docker-compose.yml to include PostgreSQL service
  - Create database connection configuration using Kysely
  - Implement database connection pooling setup
  - _Requirements: 9.1, 9.2_

- [x] 3. Create database schema and migrations
  - Define TypeScript interfaces for database tables
  - Create Kysely database schema types
  - Implement tenant table migration with proper indexes
  - _Requirements: 9.1, 9.3_

- [x] 4. Implement base CRUD repository pattern
  - Create BaseCrudRepository interface and abstract implementation
  - Implement generic CRUD operations with Kysely
  - Add pagination support to base repository
  - Write unit tests for base repository functionality
  - _Requirements: 9.2, 9.3_

- [x] 5. Implement tenant repository
  - Create TenantRepository extending BaseCrudRepository
  - Implement tenant-specific queries (findBySlug, findByPlatformId)
  - Add row-to-entity mapping methods
  - Write unit tests for tenant repository operations
  - _Requirements: 2.1, 3.1, 4.1, 7.1, 8.1_

- [x] 6. Create Zod validation schemas
  - Implement CreateTenantSchema with all validation rules
  - Implement UpdateTenantSchema with partial validation
  - Create environment configuration schema
  - Write unit tests for all validation schemas
  - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 7. Implement base CRUD service pattern
  - Create BaseCrudService interface and abstract implementation
  - Implement generic service operations with validation hooks
  - Add error handling for service layer operations
  - Write unit tests for base service functionality
  - _Requirements: 2.1, 3.1, 4.1, 5.1_

- [x] 8. Implement tenant service
  - Create TenantService extending BaseCrudService
  - Implement tenant-specific validation methods
  - Add slug generation functionality
  - Implement unique constraint validation
  - Write unit tests for tenant service operations
  - _Requirements: 2.2, 4.2, 6.2, 7.2, 8.2, 8.3, 8.4_

- [x] 9. Create authentication middleware
  - Implement API key validation middleware
  - Add secure comparison for API key verification
  - Create error responses for authentication failures
  - Write unit tests for authentication middleware
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 10. Implement Express error handling middleware
  - Create centralized error handler using Express standard pattern
  - Handle Zod validation errors with proper formatting
  - Handle database errors and constraint violations
  - Add error logging and monitoring
  - Write tests for error handling scenarios
  - _Requirements: 1.2, 2.4, 4.5, 5.3_

- [x] 11. Implement tenant API routes
- [x] 11.1 Create GET /api/tenants endpoint
  - Implement list tenants with pagination
  - Add query parameter validation
  - Integrate with tenant service and authentication middleware
  - Write integration tests for list endpoint
  - _Requirements: 3.1, 3.4_

- [x] 11.2 Create GET /api/tenants/:id endpoint
  - Implement get tenant by ID
  - Add UUID validation for ID parameter
  - Handle not found cases
  - Write integration tests for get endpoint
  - _Requirements: 3.2, 3.3, 3.4_

- [x] 11.3 Create POST /api/tenants endpoint
  - Implement create tenant functionality
  - Add request body validation with Zod
  - Handle validation errors and duplicates
  - Write integration tests for create endpoint
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 11.4 Create PATCH /api/tenants/:id endpoint
  - Implement update tenant functionality
  - Add partial update validation
  - Handle not found and validation errors
  - Write integration tests for update endpoint
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 11.5 Create DELETE /api/tenants/:id endpoint
  - Implement delete tenant functionality
  - Handle not found cases
  - Return appropriate status codes
  - Write integration tests for delete endpoint
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 12. Set up Testcontainers for integration tests
  - Configure PostgreSQL testcontainer setup
  - Create test database initialization utilities
  - Implement test data seeding functions
  - Add container cleanup after test suites
  - Write helper functions for test database management
  - _Requirements: 9.1, 9.2_

- [x] 13. Create comprehensive integration tests
  - Test complete CRUD workflows end-to-end
  - Test authentication middleware integration
  - Test error scenarios and edge cases
  - Test database constraints and unique validations
  - Verify proper HTTP status codes and response formats
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 7.1, 8.1_

- [x] 14. Update application configuration and startup
  - Integrate tenant routes into main Express app
  - Add database connection initialization
  - Update environment variable loading with validation
  - Add graceful shutdown handling for database connections
  - _Requirements: 9.1, 10.1_
