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
2. WHEN generating avatars THEN the system SHALL use a hash of the author identifier to ensure consistency
3. WHEN the same author appears multiple times THEN they SHALL always have the same avatar across all messages
4. WHEN the static site is rebuilt THEN author avatars SHALL remain consistent between builds

### Requirement 4

**User Story:** As a system administrator, I want the static website generation to be triggered automatically after Discord sync completion, so that archives are always up-to-date with the latest chat data.

#### Acceptance Criteria

1. WHEN a Discord sync job completes successfully THEN the system SHALL automatically schedule a static site generation job
2. WHEN the static site generation job runs THEN it SHALL accept a tenant ID as input
3. WHEN generation starts THEN the system SHALL fetch all relevant data for the specified tenant
4. WHEN data fetching is complete THEN the system SHALL build the NextJS static site with the bundled data
5. WHEN the build completes THEN the system SHALL store the generated files in `./dist/generated/{tenant-slug}/` directory structure
6. IF the tenant has no data THEN the system SHALL generate an empty archive with appropriate messaging

### Requirement 5

**User Story:** As a tenant user, I want to access my static archive through a web URL using my tenant slug, so that I can easily bookmark and share the archive location.

#### Acceptance Criteria

1. WHEN I navigate to a tenant-specific URL THEN the system SHALL serve the static archive for that tenant
2. WHEN the static files are generated THEN they SHALL be stored in `./dist/generated/{tenant-slug}/` directory
3. WHEN I access the archive URL THEN an nginx server SHALL serve the static files based on the tenant slug
4. WHEN the tenant slug is invalid THEN the system SHALL return an appropriate 404 error page
5. WHEN multiple tenants exist THEN each SHALL have their own isolated static archive accessible via their unique slug

### Requirement 6

**User Story:** As a system administrator, I want an nginx container to serve the static archives, so that tenants can access their archives through web URLs without additional infrastructure setup.

#### Acceptance Criteria

1. WHEN the docker-compose environment starts THEN it SHALL include an nginx container configured to serve static files
2. WHEN nginx receives a request THEN it SHALL route requests based on tenant slug to the appropriate static archive directory
3. WHEN a tenant archive exists THEN nginx SHALL serve the static files from `./dist/generated/{tenant-slug}/`
4. WHEN a tenant archive doesn't exist THEN nginx SHALL return a 404 error page
5. WHEN the nginx container starts THEN it SHALL be accessible on a designated port for archive access

### Requirement 7

**User Story:** As a tenant user, I want the archive website to be performant and responsive, so that I can efficiently browse through large amounts of chat history.

#### Acceptance Criteria

1. WHEN the static site loads THEN it SHALL display the initial page within 2 seconds
2. WHEN navigating between channels THEN the transition SHALL be instantaneous (client-side routing)
3. WHEN viewing channels with many messages THEN the system SHALL implement pagination with 250 messages per page
4. WHEN the site is accessed on mobile devices THEN it SHALL be fully responsive using DaisyUI components
5. WHEN the interface is displayed THEN it SHALL use DaisyUI component library for consistent styling and user experience

### Requirement 8

**User Story:** As a tenant user, I want different channel types to be displayed with appropriate visual styling and organization, so that I can easily understand the context and structure of different conversation formats.

#### Acceptance Criteria

1. WHEN displaying regular text channels THEN the system SHALL show messages in a simple chronological list format
2. WHEN displaying forum channels THEN the system SHALL organize content by forum posts with clear post titles and threading
3. WHEN displaying thread channels THEN the system SHALL show the thread hierarchy and parent-child relationships
4. WHEN viewing different channel types THEN each SHALL have distinct visual styling to indicate the channel type
5. WHEN navigating between channel types THEN the interface SHALL adapt to show the most appropriate layout for that channel type

### Requirement 9

**User Story:** As a tenant administrator, I want to customize the appearance of my static archive with my logo and brand colors, so that the archive reflects my organization's visual identity.

#### Acceptance Criteria

1. WHEN I configure a logo for my tenant THEN the system SHALL store it as base64 data in the PostgreSQL database
2. WHEN I configure brand colors for my tenant THEN the system SHALL store the color scheme in the database
3. WHEN the static site is generated THEN it SHALL use my configured logo and colors throughout the interface
4. WHEN I haven't configured custom branding THEN the system SHALL use default styling
5. WHEN the static site loads THEN my logo SHALL appear in the header/navigation area
6. WHEN viewing the archive THEN the color scheme SHALL be applied consistently across all pages and components

### Requirement 10

**User Story:** As a tenant administrator, I want the static archive to preserve message threading and reply relationships, so that conversation context is maintained in the archive.

#### Acceptance Criteria

1. WHEN a message is a reply to another message THEN the archive SHALL display the reply relationship visually
2. WHEN viewing threaded conversations THEN replies SHALL be properly nested or linked to parent messages
3. WHEN a message thread exists THEN users SHALL be able to expand/collapse thread views
4. WHEN displaying replies THEN the system SHALL show which message is being replied to
