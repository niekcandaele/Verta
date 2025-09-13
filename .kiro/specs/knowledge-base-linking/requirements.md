# Requirements Document

## Introduction

The Knowledge Base Linking feature extends Verta's search capabilities beyond Discord/Slack messages and golden answers to include external documentation sources. Organizations can configure their documentation websites, wikis, or help centers to be crawled and indexed, providing more comprehensive search results. The system uses XML sitemaps for discovery, performs intelligent content chunking, and maintains freshness through weekly re-crawls.

## Requirements

### Requirement 1

**User Story:** As an administrator, I want to configure external knowledge bases using sitemap URLs, so that our documentation is searchable through Verta.

#### Acceptance Criteria

1. WHEN an admin navigates to the Knowledge Base section THEN they SHALL see an interface to add sitemap URLs
2. WHEN a sitemap URL is submitted THEN the system SHALL validate that it is accessible and contains valid XML
3. WHEN validation succeeds THEN the system SHALL create a knowledge base record and schedule initial crawling
4. WHEN validation fails THEN the system SHALL display a clear error message explaining the issue
5. WHEN a knowledge base is configured THEN the admin SHALL see its processing status

### Requirement 2

**User Story:** As a system, I want to crawl and process all pages from configured sitemaps, so that content is indexed for search.

#### Acceptance Criteria

1. WHEN a crawl job executes THEN the system SHALL fetch and parse the sitemap XML
2. WHEN processing each URL from the sitemap THEN the system SHALL download the HTML content
3. WHEN HTML is downloaded THEN the system SHALL calculate a checksum to detect changes
4. IF the checksum matches the stored value THEN the system SHALL skip reprocessing that page
5. IF the checksum differs or is new THEN the system SHALL extract text and chunk the content
6. WHEN chunking content THEN the system SHALL use semantic chunking with HTML structure awareness
7. WHEN chunks are created THEN the system SHALL generate embeddings using the ML service
8. WHEN storing chunks THEN the system SHALL maintain source URL attribution

### Requirement 3

**User Story:** As a user, I want search results to include relevant knowledge base content alongside messages, so that I get comprehensive answers.

#### Acceptance Criteria

1. WHEN a user performs a search THEN the system SHALL query knowledge base chunks using vector similarity
2. WHEN displaying results THEN knowledge base content SHALL be visually distinguished from other content types
3. WHEN showing knowledge base results THEN the system SHALL display the source document title and URL
4. WHEN a user clicks a knowledge base result THEN they SHALL be directed to the original source document
5. WHEN ranking results THEN the system SHALL prioritize: golden answers > knowledge base > messages

### Requirement 4

**User Story:** As a system, I want to automatically re-crawl knowledge bases weekly, so that content stays current.

#### Acceptance Criteria

1. WHEN a week has passed since last crawl THEN the system SHALL automatically trigger a re-crawl
2. WHEN re-crawling THEN the system SHALL only reprocess pages with changed checksums
3. WHEN new pages are found in the sitemap THEN the system SHALL process them as new content
4. WHEN pages are removed from the sitemap THEN the system SHALL mark their chunks as inactive
5. WHEN a re-crawl completes THEN administrators SHALL receive a summary notification

### Requirement 5

**User Story:** As an administrator, I want to manage knowledge base configurations, so that I can update or remove sources as needed.

#### Acceptance Criteria

1. WHEN viewing knowledge bases THEN admins SHALL see a list with name, URL, status, and last crawl time
2. WHEN selecting a knowledge base THEN admins SHALL be able to edit its name or sitemap URL
3. WHEN deleting a knowledge base THEN the system SHALL remove all associated chunks
4. WHEN manually triggering a crawl THEN the system SHALL queue it immediately
5. WHEN viewing crawl status THEN admins SHALL see progress and any errors encountered

### Requirement 6

**User Story:** As a system operator, I want knowledge base processing to be reliable and performant, so that it doesn't impact core functionality.

#### Acceptance Criteria

1. WHEN crawling external sites THEN the system SHALL respect robots.txt directives
2. WHEN making requests THEN the system SHALL implement rate limiting to avoid overwhelming sources
3. WHEN processing large sites THEN the system SHALL use queue-based processing to avoid timeouts
4. IF a crawl fails THEN the system SHALL retry with exponential backoff
5. WHEN generating embeddings THEN the system SHALL batch requests to the ML service
6. WHEN storing data THEN the system SHALL use transactions to ensure consistency

### Requirement 7

**User Story:** As a developer, I want the chunking strategy to optimize for search quality, so that users find relevant content.

#### Acceptance Criteria

1. WHEN analyzing HTML structure THEN the system SHALL identify headings, sections, and articles as natural boundaries
2. WHEN creating chunks THEN the system SHALL target 300-500 tokens with a maximum of 800 tokens
3. WHEN splitting large sections THEN the system SHALL use semantic similarity to find break points
4. WHEN creating chunks THEN the system SHALL maintain 20% overlap with previous chunks
5. WHEN chunks lack structure THEN the system SHALL fall back to fixed-size chunking
6. WHEN storing chunks THEN the system SHALL preserve heading hierarchy and position metadata