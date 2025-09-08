# URL Strategy & Deep Linking System Design

## Architecture

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────┐
│   Browser   │────▶│  Next.js Pages  │────▶│  Backend API │
└─────────────┘     └─────────────────┘     └──────────────┘
                            │                        │
                            ▼                        ▼
                    ┌───────────────┐      ┌─────────────────┐
                    │ URL Resolver  │      │ Message Service │
                    └───────────────┘      └─────────────────┘
                                                    │
                                                    ▼
                                           ┌──────────────┐
                                           │    TiDB      │
                                           └──────────────┘
```

## API Design

### API Responses

```typescript
{
  data: Message[],
  meta: {
    targetMessageId?: string,
    targetMessagePosition?: number,
    navigation: {
      before: { hasMore: boolean, cursor: string },
      after: { hasMore: boolean, cursor: string }
    },
    canonical: {
      url: string,
      messageRange: { first: string, last: string }
    }
  }
}
```

### API Endpoints

```
GET /messages/:messageId
GET /channels/:channelSlug/messages/context
GET /channels/:channelSlug/messages/at/:timestamp
GET /channels/by-id/:channelId  # Fallback for UUID lookup
```

## Component Design

### Message Context Loader (`/frontend/lib/messageContext.ts`)
- Fetches target message with surrounding context
- Handles cursor-based pagination
- Logic:
  ```
  if messageId provided:
    fetch message and 50 before/after
    calculate scroll position
  else if timestamp provided:
    fetch messages around timestamp
  else:
    fetch latest messages
  ```

### URL State Manager (`/frontend/hooks/useUrlState.ts`)
- Syncs scroll position with URL
- Updates URL without navigation
- Handles browser back/forward
- Logic:
  ```
  on scroll:
    find center message
    if different from URL:
      update URL silently using replaceState
      debounce updates to avoid history spam
  ```

> **Decision**: Update URLs dynamically while scrolling
> **Rationale**: Maintains perfect deep-linkable state at any scroll position
> **Implementation**: Use replaceState to avoid cluttering browser history

### Base62 Encoder (`/backend/src/utils/base62.ts`)
- Encodes/decodes Discord message IDs
- Reduces URL length significantly
- Example: "1237913052974530651" → "7h3Kx9mP2"

> **Decision**: Use base62 encoding for message IDs
> **Rationale**: Reduces URL length from 19 to ~9 characters
> **Implementation**: Reversible encoding preserves original IDs

## Data Models

### Channel Schema Update
```sql
ALTER TABLE channels ADD COLUMN slug VARCHAR(255);
CREATE UNIQUE INDEX idx_channels_slug_tenant ON channels(slug, tenant_id);
```

### Slug Generation Logic
```
generateSlug(channelName):
  slug = lowercase(channelName)
  slug = replace spaces with hyphens
  slug = remove special characters
  slug = handle duplicates with suffix (-2, -3, etc)
  return slug
```

### Message Context Query
```typescript
interface MessageContextRequest {
  targetMessageId?: string;  // Base62 encoded
  timestamp?: string;
  beforeCount?: number;       // Default: 50
  afterCount?: number;        // Default: 50
}

interface MessageContextResponse {
  messages: Message[];
  target: {
    id: string;
    position: number;
  };
  pagination: {
    before: string | null;
    after: string | null;
  };
}
```

## Code Change Analysis

| Component | Action | Justification |
|-----------|--------|---------------|
| `/frontend/pages/channel/[channelId]/[page].tsx` | Remove | Replaced by new routing structure |
| `/frontend/pages/channel/[channelSlug]/index.tsx` | Create | Channel latest view with slug support |
| `/frontend/pages/channel/[channelSlug]/message/[messageId].tsx` | Create | Message permalink page |
| `/frontend/pages/channel/[channelSlug]/at/[timestamp].tsx` | Create | Time-based navigation |
| `/frontend/pages/thread/[threadId]/index.tsx` | Create | Direct thread access |
| `/backend/src/routes/api/v1/content.ts` | Extend | Add message-centric endpoints and slug resolution |
| `/backend/src/services/content/ContentService.ts` | Extend | Add message context methods and slug handling |
| `/frontend/components/MessageView.tsx` | Create | Unified message display with highlighting |
| `/frontend/lib/navigation.ts` | Create | URL generation with base62 encoding |
| `/backend/src/utils/base62.ts` | Create | Base62 encoding/decoding for message IDs |
| `/backend/src/utils/slugify.ts` | Create | Channel slug generation utilities |
| `/backend/src/sync/channelSync.ts` | Extend | Add slug generation during sync |
| **Database Migration** | Create | Add `slug` column to channels table |

## Code to Remove

- **`/frontend/pages/channel/[channelId]/[page].tsx`** 
  - Obsolete due to new routing strategy
  - Replaced by message-centric views
  - Migration: Redirect `/channel/{id}/{page}` → `/channel/{id}`

- **Page number references in `SearchResults.tsx`**
  - Line 72: `href={channelId ? `/channel/${channelId}/1#${messageId}` : '#'}`
  - Replaced with: `href={`/channel/${channelId}/message/${messageId}`}`

## Security Considerations

- Validate message belongs to requested channel
- Respect tenant isolation
- Rate limit permalink generation
- Sanitize timestamp inputs
- Validate base62 encoded IDs before decoding
- Ensure channel slugs are URL-safe

## Testing Strategy

### Unit tests
- URL parsing and generation
- Message context calculations
- Pagination cursor logic

### Integration tests
- Message permalink resolution
- Cross-channel security
- Search result navigation

### E2E tests
- Share message → Open link → See context
- Navigate by time → Correct messages load
- Search → Click result → Correct position

## Rollout Plan

1. **Phase 1**: Database Migration & Sync Updates
   - Add `slug` column to channels table
   - Generate slugs for existing channels
   - Update sync process to generate slugs for new channels
   - Test slug uniqueness and conflict resolution

2. **Phase 2**: Deploy Backend Changes
   - Base62 encoding/decoding utilities
   - New message context endpoints
   - Slug resolution middleware
   - Channel slug lookup support

3. **Phase 3**: Frontend Implementation
   - New routing structure with slugs
   - Message permalink pages
   - URL state management with scroll sync
   - Update all internal navigation

4. **Phase 4**: Search & Navigation Updates
   - Update search results to use permalinks
   - Implement dynamic URL updates on scroll
   - Add share buttons with permalink generation
   - Monitor performance metrics

5. **Phase 5**: Migration & Cleanup
   - Remove paginated routes
   - Set up redirects from old URLs
   - Archive deprecated code
   - SEO submission of new URL structure

## Alternatives Considered

| Option | Pros | Cons | Why Not Chosen |
|--------|------|------|----------------|
| Hash-based anchors | Simple implementation | Breaks with dynamic loading | Already proven unreliable |
| Sequential message numbers | Human-friendly (msg #1234) | Requires reindexing on deletes | Not stable with Discord sync |
| Separate message pages | True permalinks | Loses conversational context | Poor user experience |
| Cursor pagination | Efficient for large datasets | Complex URL structure | URLs not human-readable |