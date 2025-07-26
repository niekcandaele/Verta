# Requirements Document

## Introduction

This feature will generate static NextJS websites for each tenant that serve as comprehensive archives of all chat messages across all channels. The websites must be fully static with all tenant data bundled at build time, providing a read-only archive interface with consistent avatar generation using Dicebear.

## Requirements

### Requirement 1

**User Story:** As a tenant administrator, I want a static website generated for my tenant, so that I can access a permanent archive of all chat messages without requiring the main application to be online.

#### Acceptance Criteria

1. WHEN a tenant requests a static archive THEN the system SHALL generate a fully static NextJS website containing all tenant data
2. WHEN the static website is built THEN the system SHALL bundle all chat messages and channel data at build time
3. WHEN the static website is accessed THEN it SHALL function without any backend API calls or database connections
4. WHEN the static website is deployed THEN it SHALL be completely self-contained with no external dependencies

### Requirement 2

**User Story:** As a tenant user, I want to browse all chat messages organized by channels, so that I can easily navigate through the archived conversations.

#### Acceptance Criteria

1. WHEN I visit the static archive website THEN I SHALL see a list of all channels for the tenant
2. WHEN I select a channel THEN I SHALL see all messages in that channel displayed chronologically
3. WHEN viewing messages THEN I SHALL see the author name, timestamp, and message content
4. WHEN a message has attachments THEN I SHALL see the attachment information or embedded content
5. WHEN a message has emoji reactions THEN I SHALL see the reaction counts and types

### Requirement 3

**User Story:** As a tenant user, I want consistent avatar images for all message authors, so that I can easily identify who wrote each message.

#### Acceptance Criteria

1. WHEN displaying a message author THEN the system SHALL show a Dicebear avatar using the "shapes" style
2. WHEN generating avatars THEN the system SHALL use the existing anonymized user ID directly as the seed for Dicebear
3. WHEN the same author appears multiple times THEN they SHALL always have the same avatar across all messages
4. WHEN the static site is rebuilt THEN author avatars SHALL remain consistent between builds
5. WHEN avatars are generated THEN they SHALL be created during the NextJS build process, not in the backend

### Requirement 4

**User Story:** As a system administrator, I want the backend to export all tenant data as structured JSON files that can be consumed by the frontend static site generator, so that the frontend doesn't need database access.

#### Acceptance Criteria

1. WHEN I trigger a data export via HTTP endpoint THEN the system SHALL create a BullMQ job for tracking
2. WHEN the export job runs THEN it SHALL loop over all active tenants and export their data
3. WHEN exporting data for a tenant THEN the system SHALL aggregate all channels, messages, reactions, attachments, and branding configuration
4. WHEN generating JSON files THEN the system SHALL create files with up to 1000 messages per file for efficient processing
5. WHEN the export is complete THEN the JSON files SHALL be saved to `_data/data-export/{tenant-slug}/` directory
6. WHEN exporting tenant data THEN the system SHALL include tenant branding information (logo, colors) in the metadata
7. IF a tenant has no data THEN the system SHALL generate minimal JSON files with empty arrays
8. WHEN the frontend builds THEN it SHALL read these JSON files from the _data/data-export directory without requiring database access
9. WHEN running npm scripts THEN they SHALL trigger exports via HTTP calls to the backend API

### Requirement 5

**User Story:** As a tenant user, I want to access my static archive through a web URL using my tenant slug, so that I can easily bookmark and share the archive location.

#### Acceptance Criteria

1. WHEN the static site is built for a specific tenant THEN NextJS SHALL output the files to `_data/next-export/{tenant-slug}/` directory
2. WHEN building archives THEN each tenant SHALL have a completely separate static site build
3. WHEN the build is complete THEN the static files SHALL be ready for deployment to any static hosting service
4. WHEN accessing the archive THEN all navigation SHALL work with client-side routing
5. WHEN the archive is deployed THEN it SHALL function as a completely static website with no server requirements
6. WHEN building multiple tenant archives THEN wrapper scripts SHALL facilitate tenant-specific builds

### Requirement 6

**User Story:** As a tenant user, I want the archive website to be performant and responsive, so that I can efficiently browse through large amounts of chat history.

#### Acceptance Criteria

1. WHEN the static site loads THEN it SHALL display the initial page within 2 seconds
2. WHEN navigating between channels THEN the transition SHALL be instantaneous (client-side routing)
3. WHEN viewing channels with many messages THEN the system SHALL implement pagination with 250 messages per page
4. WHEN the site is accessed on mobile devices THEN it SHALL be fully responsive using DaisyUI components
5. WHEN the interface is displayed THEN it SHALL use DaisyUI component library for consistent styling and user experience

### Requirement 7

**User Story:** As a tenant user, I want different channel types to be displayed with appropriate visual styling and organization, so that I can easily understand the context and structure of different conversation formats.

#### Acceptance Criteria

1. WHEN displaying regular text channels THEN the system SHALL show messages in a simple chronological list format
2. WHEN displaying forum channels THEN the system SHALL organize content by forum posts with clear post titles and threading
3. WHEN displaying thread channels THEN the system SHALL show the thread hierarchy and parent-child relationships
4. WHEN viewing different channel types THEN each SHALL have distinct visual styling to indicate the channel type
5. WHEN navigating between channel types THEN the interface SHALL adapt to show the most appropriate layout for that channel type

### Requirement 8

**User Story:** As a tenant administrator, I want to customize the appearance of my static archive with my logo and brand colors, so that the archive reflects my organization's visual identity.

#### Acceptance Criteria

1. WHEN I configure a logo for my tenant THEN the system SHALL store it as base64 data in the PostgreSQL database
2. WHEN I configure brand colors for my tenant THEN the system SHALL store the color scheme in the database
3. WHEN the tenantDataAggregator script runs THEN it SHALL include the branding configuration in the exported data
4. WHEN the static site is generated THEN it SHALL use my configured logo and colors throughout the interface
5. WHEN I haven't configured custom branding THEN the system SHALL use a well-defined default theme with standard colors and placeholder logo
6. WHEN the static site loads THEN my logo SHALL appear in the header/navigation area
7. WHEN viewing the archive THEN the color scheme SHALL be applied consistently across all pages and components

### Requirement 9

**User Story:** As a tenant administrator, I want the static archive to preserve message threading and reply relationships, so that conversation context is maintained in the archive.

#### Acceptance Criteria

1. WHEN a message is a reply to another message THEN the archive SHALL display the reply relationship visually
2. WHEN viewing threaded conversations THEN replies SHALL be properly nested or linked to parent messages
3. WHEN a message thread exists THEN users SHALL be able to expand/collapse thread views
4. WHEN displaying replies THEN the system SHALL show which message is being replied to

### Requirement 10

**User Story:** As a developer, I want shared type definitions between backend and frontend to ensure type safety across the static archive system.

#### Acceptance Criteria

1. WHEN developing the system THEN a shared-types package SHALL provide common type definitions
2. WHEN the backend exports data THEN it SHALL use types from the shared-types package
3. WHEN the frontend reads data THEN it SHALL use the same types from the shared-types package
4. WHEN types are updated THEN both backend and frontend SHALL use the updated definitions
5. WHEN building either backend or frontend THEN TypeScript SHALL validate against the shared types

### Requirement 11

**User Story:** As a system administrator, I want to trigger data exports via HTTP API endpoints, so that I can integrate the export process with automation tools and track job progress.

#### Acceptance Criteria

1. WHEN I send a POST request to `/api/export/all-tenants` THEN the system SHALL create BullMQ jobs for all active tenants
2. WHEN I send a POST request to `/api/export/tenant/:tenantId` THEN the system SHALL create a BullMQ job for that specific tenant
3. WHEN an export job is created THEN it SHALL be trackable through the job queue system
4. WHEN an export job is running THEN the system SHALL process it asynchronously without blocking the API response
5. WHEN npm scripts are used for exports THEN they SHALL make HTTP calls to these endpoints instead of running processes directly
6. WHEN export jobs fail THEN they SHALL be retryable through the BullMQ interface

### Requirement 12

**User Story:** As a system administrator, I want to check the status of export jobs, so that I can monitor progress and troubleshoot failures.

#### Acceptance Criteria

1. WHEN I send a GET request to `/api/export/status/:jobId` THEN the system SHALL return the current job status
2. WHEN a job is in progress THEN the status SHALL include completion percentage and current operation
3. WHEN a job has failed THEN the status SHALL include error details and retry information
4. WHEN a job has completed THEN the status SHALL include execution time and summary statistics
5. WHEN multiple jobs are running THEN each SHALL have independent status tracking
6. WHEN a job ID doesn't exist THEN the system SHALL return an appropriate 404 error
