# Advanced Search Requirements Update

## Critical Discovery: Message Coverage Issue

During implementation, we discovered a critical limitation in the original design that would have severely impacted search functionality.

### Issue Analysis
- **Total messages in database**: 250,709
- **Messages classified as questions**: 92
- **Coverage with original design**: 0.04% of messages

The original design only searched messages that were classified as questions by the ML model, which would have made 99.96% of content unsearchable.

## Updated Requirements

### Expanded Scope
- **REQ-001a**: The system SHALL generate embeddings for ALL messages, not just those classified as questions
- **REQ-001b**: The messages table SHALL have a vector column for storing embeddings directly
- **REQ-001c**: The sync process SHALL generate embeddings for new messages in real-time
- **REQ-001d**: A background job SHALL generate embeddings for historical messages

### Success Metrics Update
- **Original**: Implicit assumption that question clustering was sufficient
- **Updated**: Explicit target of >95% message embedding coverage within 7 days of deployment
- **Ongoing**: All new messages receive embeddings during sync process

## Design Impact

### Database Schema Changes
- Added vector column to messages table (not just golden_answers)
- Added index on messages(channel_id, embedding IS NOT NULL)

### Processing Changes
- Extended sync worker to generate embeddings for all new messages
- Added background job to process historical messages
- Modified search to query messages directly instead of through question_clusters

### User Experience Impact
- Users can search across ALL content types (questions, answers, discussions)
- Search results are truly comprehensive
- Better discoverability of information across the entire archive

## Implementation Notes

These requirements were discovered and addressed during Phase 1 implementation. All tasks have been updated to reflect the expanded scope, ensuring comprehensive search coverage across the entire message archive.