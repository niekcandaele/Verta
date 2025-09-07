# URL Strategy & Deep Linking System Requirements

## Problem Statement

The current URL structure uses paginated navigation (`/channel/{channelId}/{page}`) which creates unstable links that change as new messages are added. Users cannot create permanent links to specific messages, search results cannot reliably link to content, and the system lacks SEO-friendly URLs. This severely limits content discoverability and sharing capabilities.

## Current State

- **URL Pattern**: `/channel/{uuid}/{pageNumber}` 
- **Issues**:
  - Message positions shift as new content is added
  - No direct message permalinks
  - Search results link to page 1 with hash anchors that frequently break
  - Channel IDs are UUIDs, providing no semantic meaning
  - No URL hierarchy for forum threads
  - Poor SEO due to unstable, non-descriptive URLs

## Requirements

### Functional Requirements

- REQ-001: The system SHALL provide permanent URLs for individual messages using base62-encoded Discord IDs
- REQ-002: WHEN a message permalink is accessed THEN the message appears in context with 50 messages before and after
- REQ-003: The system SHALL use human-readable channel slugs in URLs (e.g., `/channel/general-chat`)
- REQ-004: WHEN scrolling through messages THEN the URL updates dynamically to reflect the current position
- REQ-005: The system SHALL provide direct links to forum threads using simplified `/thread/{threadId}` pattern
- REQ-006: WHEN searching THEN results link directly to message permalinks
- REQ-007: The system SHALL support time-based navigation for channels
- REQ-008: The system SHALL generate URL-safe slugs for all channels during migration and sync operations

### Non-Functional Requirements

- **Performance**: Message permalink resolution < 100ms
- **SEO**: All content URLs must be crawlable with proper meta tags
- **Usability**: URLs should be memorable and shareable
- **Scalability**: URL structure must support millions of messages

## Constraints

- Must work with existing Discord message IDs (platform_message_id)
- Channel IDs in database are UUIDs
- Messages ordered by platform_created_at timestamp
- Database schema changes allowed (new columns permitted)

> **Decision**: Add channel slug column to database
> **Rationale**: Human-readable URLs significantly improve SEO and user experience
> **Migration**: Generate slugs for existing channels, handle in sync process

## Success Criteria

- Zero broken links after migration
- Search result click-through improvements > 50%
- Direct message sharing adoption > 30% in first month
- Google indexing of message content within 2 weeks

## User Workflows

### Direct Message Sharing
User finds interesting message → Clicks share button → Copies permalink → Shares URL → Recipient opens URL → Sees message in context

### Search to Message Navigation  
User searches for content → Clicks search result → Navigates directly to message → Message highlighted in view → Can scroll for context

### Time-based Channel Browsing
User wants to see channel at specific date → Uses date picker → URL updates to time-based view → Messages from that period load → Can navigate forward/backward in time

### Forum Thread Access
User browses forum → Clicks thread → Direct URL to thread → All thread messages load → Can share thread URL

## URL Patterns

```
/channel/{channelSlug}                        # Latest messages
/channel/{channelSlug}/message/{messageId}    # Message permalink (base62 encoded)
/channel/{channelSlug}/at/{timestamp}         # Time-based view
/thread/{threadId}                            # Direct thread access (base62 encoded)
/thread/{threadId}/message/{messageId}        # Thread message permalink
```

> **Decision**: Use simplified thread URLs without forum hierarchy
> **Rationale**: Shorter, more shareable URLs improve user experience
> **Trade-off**: Loses some context but threads have unique IDs