# Requirements Document

## Introduction

The Question Cluster Management feature extends the existing clustering system with manual control capabilities. Currently, clusters are only created automatically through the analysis pipeline, and administrators lack direct control to create custom clusters or remove incorrect ones. This feature adds manual cluster creation and deletion functionality, enabling administrators to better manage question categorization across tenants.

## Requirements

### Requirement 1

**User Story:** As an administrator, I want to manually create question clusters, so that I can predefine categories for common questions.

#### Acceptance Criteria

1. WHEN creating a cluster THEN the system SHALL require tenant_id and representative_text as minimum inputs
2. WHEN submitting cluster creation THEN the system SHALL allow optional thread_title and example_questions fields
3. WHEN example questions are provided THEN the system SHALL combine them with representative_text for embedding generation
4. WHEN creating a cluster THEN the system SHALL generate embeddings using the ML service
5. WHEN creation succeeds THEN the system SHALL return the complete cluster object with metadata
6. WHEN creation fails THEN the system SHALL provide clear error messages about what went wrong

### Requirement 2

**User Story:** As an administrator, I want to delete obsolete or incorrect clusters, so that the system remains clean and accurate.

#### Acceptance Criteria

1. WHEN deleting a cluster THEN the system SHALL perform a hard delete (no soft delete)
2. WHEN a cluster is deleted THEN the system SHALL cascade delete all associated question instances
3. WHEN a cluster with golden answers is deleted THEN the system SHALL also remove those golden answers
4. WHEN deletion is requested THEN the system SHALL require confirmation from the user
5. WHEN showing confirmation THEN the system SHALL display impact summary (instance count, golden answer status)
6. WHEN deletion completes THEN the user SHALL be redirected to the cluster list

### Requirement 3

**User Story:** As an administrator, I want to bulk delete multiple clusters, so that I can efficiently clean up many clusters at once.

#### Acceptance Criteria

1. WHEN selecting clusters THEN the system SHALL allow selection of up to 10 clusters at a time
2. WHEN bulk delete is requested THEN the system SHALL show a summary of all selected clusters
3. WHEN processing bulk deletion THEN the system SHALL handle each deletion independently
4. WHEN some deletions fail THEN the system SHALL continue with remaining deletions
5. WHEN bulk operation completes THEN the system SHALL show detailed results for each cluster
6. WHEN showing results THEN the system SHALL indicate which succeeded and which failed with reasons

### Requirement 4

**User Story:** As an administrator, I want full access to all tenant clusters, so that I can manage the entire system effectively.

#### Acceptance Criteria

1. WHEN authenticated as admin THEN the system SHALL allow access to all tenant clusters
2. WHEN creating clusters THEN admins SHALL be able to select any tenant
3. WHEN deleting clusters THEN admins SHALL not be restricted by tenant ownership
4. WHEN viewing clusters THEN admins SHALL see clusters from all tenants
5. WHEN performing any operation THEN the system SHALL require admin authentication via X-API-KEY

### Requirement 5

**User Story:** As a system operator, I want cluster operations to maintain data integrity, so that the database remains consistent.

#### Acceptance Criteria

1. WHEN creating clusters THEN the system SHALL generate unique IDs using UUID v4
2. WHEN deleting clusters THEN the system SHALL rely on foreign key cascade constraints
3. WHEN operations fail THEN the system SHALL rollback any partial changes
4. WHEN concurrent operations occur THEN the system SHALL handle them safely
5. WHEN timestamps are recorded THEN the system SHALL use database-generated values

### Requirement 6

**User Story:** As a developer, I want the new features to follow existing patterns, so that the codebase remains consistent.

#### Acceptance Criteria

1. WHEN implementing endpoints THEN they SHALL follow existing REST patterns
2. WHEN adding repository methods THEN they SHALL extend existing BaseCrudRepository
3. WHEN creating UI components THEN they SHALL match existing modal and form patterns
4. WHEN handling errors THEN they SHALL use existing error response formats
5. WHEN adding API methods THEN they SHALL follow existing TypeScript patterns

### Requirement 7

**User Story:** As a user, I want clear feedback during operations, so that I understand what's happening.

#### Acceptance Criteria

1. WHEN operations are in progress THEN the system SHALL show loading indicators
2. WHEN operations succeed THEN the system SHALL show success notifications
3. WHEN operations fail THEN the system SHALL show error messages with actionable information
4. WHEN performing destructive operations THEN the system SHALL require explicit confirmation
5. WHEN showing forms THEN the system SHALL indicate required vs optional fields