# Implementation Plan

- [ ] 1. Set up project dependencies and core infrastructure
  - Install BullMQ, Discord.js, Redis client dependencies
  - Configure Redis connection for BullMQ queue system
  - Set up environment variables for single Discord bot token and Redis configuration
  - _Requirements: 1.1, 2.1, 3.1, 13.1, 13.3_

- [ ] 2. Create database migrations for platform sync tables
  - Create migration for channels table with platform-agnostic schema
  - Create migration for messages table with anonymized user IDs and reply_to_id field
  - Create migration for message_emoji_reactions table to track emoji reactions
  - Create migration for message_attachments table to store attachment metadata
  - Create migration for sync_progress table for recovery state (storing last message ID/timestamp per channel)
  - Add database indexes for optimal query performance
  - _Requirements: 4.1, 4.2, 4.5, 10.1, 10.3, 11.1, 11.4, 12.1, 12.2, 12.3_

- [ ] 3. Implement ID anonymization utility
  - Create CryptoIdHasher class with consistent user ID hashing (no salt)
  - _Requirements: 4.4_

- [ ] 4. Create platform-agnostic data models and types
  - Define Channel, Message, and SyncProgress TypeScript interfaces
  - Define MessageEmojiReaction and MessageAttachment TypeScript interfaces
  - Create PlatformChannel and PlatformMessage adapter types
  - Define SyncJobData and SyncCheckpoint interfaces for BullMQ
  - Write validation schemas using Zod for all data types
  - _Requirements: 4.1, 4.2, 10.1, 10.3, 11.1, 11.4, 12.1, 12.2, 12.3_

- [ ] 5. Implement platform-agnostic repository layer
  - Create ChannelRepository interface and implementation using Kysely
  - Create MessageRepository with bulk insert capabilities
  - Create MessageEmojiReactionRepository for storing emoji reactions
  - Create MessageAttachmentRepository for storing attachment metadata
  - Create SyncProgressRepository for tracking last sync state (message ID/timestamp per channel)
  - _Requirements: 4.1, 4.2, 4.5, 10.1, 10.3, 11.1, 11.4, 12.1, 12.2_

- [ ] 6. Create platform adapter interface and Discord implementation
  - Define abstract PlatformAdapter interface
  - Implement DiscordAdapter using Discord.js client with centrally configured bot token
  - Add authentication using single Discord bot token from environment variables
  - Implement message pagination without internal rate limiting (handle Discord rate limit errors by exiting)
  - _Requirements: 1.2, 1.3, 1.6, 13.1, 13.2, 13.3, 14.1, 14.2_

- [ ] 7. Implement BullMQ queue system and job processing
  - Set up BullMQ queue with Redis configuration
  - Create sync job processor with platform adapter integration
  - Implement exponential backoff retry logic (3 max retries: 1s, 2s, 4s)
  - Add error logging and bail out after max retries
  - _Requirements: 1.1, 2.1, 5.1, 5.4, 15.1, 15.2, 15.3, 15.4_

- [ ] 8. Implement basic error handling and logging
  - Add simple error logging for sync operations
  - Log errors to database and console (no recovery, just bail out)
  - Create error sanitization for API responses
  - Handle rate limit errors by exiting immediately (rely on next hourly sync)
  - _Requirements: 5.4, 5.5, 6.4, 14.2, 14.3, 14.4_

- [ ] 9. Create platform sync service orchestrator
  - Implement PlatformSyncService with queue management methods
  - Add sync job queuing for scheduled, manual, and initial syncs
  - Implement sync status checking using BullMQ job state
  - Add job cancellation and cleanup functionality
  - _Requirements: 1.1, 2.1, 2.2, 5.1_

- [ ] 10. Implement Discord sync logic with incremental sync support
  - Create per-channel sync progress tracking with message-level checkpoints
  - Implement incremental sync: start from last synced message timestamp/ID (or from beginning if first sync)
  - Process channels sequentially (no parallelization) to avoid rate limits
  - Implement message batch processing (1000 messages per batch) with progress updates
  - Add sync resume functionality from exact last processed message per channel
  - Implement Discord guild channel discovery (text, threads, forums)
  - Add message fetching with proper pagination
  - Implement thread and forum post message collection
  - Add user ID anonymization during message processing
  - Implement message reply tracking (reply_to_id relationships)
  - Implement emoji reaction syncing with standard and custom emoji support
  - Add message attachment metadata extraction and URL storage
  - Handle Discord rate limit errors by exiting and relying on next sync
  - Update sync_progress after each successful channel sync
  - _Requirements: 1.2, 1.3, 1.5, 1.6, 4.4, 5.2, 5.3, 5.5, 10.1, 10.3, 11.1, 11.3, 12.1, 12.2, 12.3, 14.2, 14.3, 15.1, 15.2, 15.4_

- [ ] 11. Add scheduled sync functionality
  - Create cron scheduler for hourly tenant syncs
  - Implement tenant filtering for Discord platform only
  - Add recurring sync job scheduling and management
  - Implement sync job deduplication to prevent overlaps
  - _Requirements: 1.1_

- [ ] 12. Implement manual sync API endpoints
  - Create POST /api/tenants/{tenantId}/sync endpoint
  - Add sync job queuing with immediate execution
  - Implement sync status checking endpoints
  - Add proper authentication and input validation
  - _Requirements: 2.1, 2.2, 2.4_

- [ ] 13. Add initial sync on tenant creation
  - Modify tenant creation service to trigger Discord sync
  - Implement initial sync job queuing for Discord tenants
  - Add sync status tracking during tenant onboarding
  - Handle initial sync failures with basic error logging
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 14. Add sync monitoring and status endpoints
  - Create GET /api/tenants/{tenantId}/sync/status endpoint
  - Implement sync progress and performance metrics collection
  - Add sync history and error reporting capabilities
  - Create admin endpoints for sync queue monitoring
  - _Requirements: 6.1, 6.2, 6.3, 6.5_
