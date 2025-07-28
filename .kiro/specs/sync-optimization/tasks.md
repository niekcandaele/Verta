# Implementation Tasks for Sync Optimization

## Overview
This implementation plan breaks down the sync optimization feature into 6 phases, building incrementally from foundation to full parallel processing. Each phase delivers testable functionality while maintaining backward compatibility.

## Phase 1: Foundation Setup
Set up configuration, database schema, and queue infrastructure for parallel sync processing.

- [ ] Task 1: Add sync configuration to environment schema
  - **Prompt**: Update backend/src/config/env.ts to add SYNC_MAX_CHANNEL_WORKERS (number, default 10), SYNC_CHANNEL_BATCH_SIZE (number, default 5), and SYNC_MESSAGE_FETCH_SIZE (number, default 100) to the ConfigSchema. Use the existing pattern for environment variable validation with zod.
  - **Requirements**: REQ-009, REQ-010
  - **Design ref**: Section "Configuration Migration"
  - **Files**: backend/src/config/env.ts

- [ ] Task 2: Create database migration for channel sync tracking
  - **Prompt**: Create backend/src/database/migrations/007_add_channel_sync_tracking.ts that creates the channel_sync_jobs table and updates sync_progress table according to the SQL in the design document. Follow the existing migration pattern from 002_create_sync_tables.ts. Include proper indexes and foreign key constraints.
  - **Requirements**: REQ-006, REQ-008
  - **Design ref**: Section "Database Migration"
  - **Files**: backend/src/database/migrations/007_add_channel_sync_tracking.ts

- [ ] Task 3: Create channel sync queue
  - **Prompt**: Create backend/src/queues/channelSyncQueue.ts that exports a BullMQ queue for channel sync jobs. Define the ChannelSyncJobData interface with fields from the design. Configure the queue with similar options to syncQueue.ts but name it 'channel-sync'.
  - **Requirements**: REQ-001, REQ-003
  - **Design ref**: Section 1 "Enhanced Sync Queue System"
  - **Files**: backend/src/queues/channelSyncQueue.ts

## Phase 2: Data Layer Updates
Update repositories and types to support parallel sync tracking.

- [ ] Task 4: Update sync types with new interfaces
  - **Prompt**: Update backend/src/types/sync.ts to add the ChannelSyncState interface and update SyncJobResult with optional parallelStats and channelResults fields as defined in the design. Keep all existing fields unchanged.
  - **Requirements**: REQ-006, REQ-011
  - **Design ref**: Section "Data Models"
  - **Files**: backend/src/types/sync.ts

- [ ] Task 5: Create channel sync jobs repository
  - **Prompt**: Create backend/src/repositories/sync/ChannelSyncJobRepository.ts that extends BaseCrudRepository for the channel_sync_jobs table. Add methods: findByParentJobId(parentJobId: string), findByWorkerId(workerId: string), claimJob(jobId: string, workerId: string), and updateProgress(jobId: string, messagesProcessed: number). Follow the pattern from MessageRepository.ts.
  - **Requirements**: REQ-006, REQ-007
  - **Design ref**: Section "Data Models"
  - **Files**: backend/src/repositories/sync/ChannelSyncJobRepository.ts, backend/src/repositories/sync/index.ts

- [ ] Task 6: Update sync progress repository for worker tracking
  - **Prompt**: Update backend/src/repositories/sync/SyncProgressRepository.ts to add methods for worker assignment: claimChannel(channelId: string, workerId: string), releaseChannel(channelId: string, workerId: string), and findByWorkerId(workerId: string). Add support for the new columns (worker_id, started_at, messages_per_second).
  - **Requirements**: REQ-006, REQ-008
  - **Design ref**: Section 4 "Progress Tracking Enhancement"
  - **Files**: backend/src/repositories/sync/SyncProgressRepository.ts

## Phase 3: Channel Worker Implementation
Create the channel sync worker that processes individual channels in parallel.

- [ ] Task 7: Create channel sync worker
  - **Prompt**: Create backend/src/workers/channelSyncWorker.ts that processes ChannelSyncJobData jobs. Implement the processChannel method following the design: claim channel, get checkpoint, fetch messages using existing Discord adapter (with max batch size 100), process messages, and update progress. Use the existing message processing logic from syncWorker.ts but for a single channel. Configure worker with concurrency from SYNC_MAX_CHANNEL_WORKERS.
  - **Requirements**: REQ-001, REQ-002, REQ-005, REQ-007
  - **Design ref**: Section 2 "Channel Worker Implementation"
  - **Files**: backend/src/workers/channelSyncWorker.ts

- [ ] Task 8: Update Discord adapter to use maximum batch size
  - **Prompt**: Update backend/src/adapters/discord/DiscordAdapter.ts fetchMessages method to default to limit: 100 instead of the current default. Ensure the fetchOptions.limit is always capped at 100 (Discord's maximum). No other changes needed since Discord.js handles rate limiting.
  - **Requirements**: REQ-002
  - **Design ref**: Section "Message Fetching"
  - **Files**: backend/src/adapters/discord/DiscordAdapter.ts

- [ ] Task 9: Add channel worker to worker index
  - **Prompt**: Update backend/src/workers/index.ts to import and start the ChannelSyncWorker alongside the existing SyncWorker. Follow the same pattern of instantiation and lifecycle management.
  - **Requirements**: REQ-001
  - **Design ref**: Section "Architecture"
  - **Files**: backend/src/workers/index.ts

## Phase 4: Master Worker Refactoring
Refactor the master sync worker to dispatch channel jobs instead of processing them sequentially.

- [ ] Task 10: Refactor sync worker to dispatch channel jobs
  - **Prompt**: Update backend/src/workers/syncWorker.ts processSyncJob method to create and dispatch channel sync jobs instead of processing channels sequentially. After fetching channels, create ChannelSyncJobData for each channel and add them to channelSyncQueue using addBulk. Remove the channel processing loop and replace with progress monitoring that polls channel job statuses.
  - **Requirements**: REQ-001, REQ-006
  - **Design ref**: Section 1 "Master Sync Worker Flow"
  - **Files**: backend/src/workers/syncWorker.ts

- [ ] Task 11: Implement channel progress monitoring
  - **Prompt**: Add a monitorChannelProgress method to backend/src/workers/syncWorker.ts that polls the status of dispatched channel jobs using ChannelSyncJobRepository. Aggregate results into SyncJobResult with new parallelStats. Update job progress periodically. Continue until all channel jobs are completed or failed.
  - **Requirements**: REQ-008, REQ-011
  - **Design ref**: Section 1 "Master Sync Worker Flow"
  - **Files**: backend/src/workers/syncWorker.ts

- [ ] Task 12: Add error aggregation for failed channels
  - **Prompt**: Update the error handling in backend/src/workers/syncWorker.ts to collect errors from failed channel jobs and add them to the SyncJobResult errors array. Ensure channel failures are isolated and don't fail the entire sync job unless all channels fail.
  - **Requirements**: REQ-007, REQ-012
  - **Design ref**: Section "Channel Failure Isolation"
  - **Files**: backend/src/workers/syncWorker.ts

## Phase 5: Monitoring and Scripts
Add monitoring capabilities and developer scripts for managing sync operations.

- [ ] Task 13: Add sync performance metrics logging
  - **Prompt**: Update both sync workers to emit structured logs with performance metrics: channels per minute, messages per second, concurrent channels, and rate limit encounters. Use the existing logger with a 'sync-metrics' context. Calculate and log these metrics at regular intervals and in the final job result.
  - **Requirements**: REQ-011, REQ-012
  - **Design ref**: Section "Monitoring Requirements"
  - **Files**: backend/src/workers/syncWorker.ts, backend/src/workers/channelSyncWorker.ts

- [ ] Task 14: Create sync start script
  - **Prompt**: Create backend/scripts/sync-start.ts that triggers a sync via the API. Accept --tenant parameter to sync a specific tenant or sync all if not provided. Use the existing pattern from discord-sync.js but convert to TypeScript. Use the sync API endpoint with proper error handling.
  - **Requirements**: REQ-009
  - **Design ref**: Section "Developer Experience"
  - **Files**: backend/scripts/sync-start.ts, backend/package.json

- [ ] Task 15: Create sync reset script
  - **Prompt**: Create backend/scripts/sync-reset.ts that resets sync progress for a tenant. Accept required --tenant parameter. Prompt for confirmation before deleting from sync_progress and channel_sync_jobs tables. Use direct database queries with the existing db connection.
  - **Requirements**: REQ-008
  - **Design ref**: Section "Developer Experience"
  - **Files**: backend/scripts/sync-reset.ts, backend/package.json

- [ ] Task 16: Create sync status script
  - **Prompt**: Create backend/scripts/sync-status.ts that checks the status of a sync job. Accept required --job-id parameter. Query both the BullMQ job and channel_sync_jobs to show overall progress and per-channel status. Display results in a formatted table.
  - **Requirements**: REQ-008, REQ-011
  - **Design ref**: Section "Developer Experience"
  - **Files**: backend/scripts/sync-status.ts, backend/package.json

## Phase 6: Testing and Optimization
Add comprehensive tests and optimize based on performance testing.

- [ ] Task 17: Add unit tests for channel sync worker
  - **Prompt**: Create backend/src/workers/__tests__/channelSyncWorker.test.ts with unit tests for the channel sync worker. Test channel claiming, checkpoint retrieval, message fetching, and progress updates. Mock the Discord adapter and repositories. Follow the existing test patterns from the codebase.
  - **Requirements**: REQ-005, REQ-007
  - **Design ref**: Section "Testing Strategy"
  - **Files**: backend/src/workers/__tests__/channelSyncWorker.test.ts

- [ ] Task 18: Add integration tests for parallel sync
  - **Prompt**: Create backend/src/workers/__tests__/parallelSync.integration.test.ts that tests the full parallel sync flow with multiple channels. Use test containers for PostgreSQL and Redis. Verify channels are processed concurrently, progress is tracked correctly, and errors are isolated. Mock Discord API responses.
  - **Requirements**: REQ-001, REQ-005, REQ-007
  - **Design ref**: Section "Integration Tests"
  - **Files**: backend/src/workers/__tests__/parallelSync.integration.test.ts

- [ ] Task 19: Add rate limit monitoring
  - **Prompt**: Update backend/src/adapters/discord/DiscordAdapter.ts to optionally listen for Discord.js rate limit events if a DEBUG_RATE_LIMITS env var is set. Log rate limit information including timeout, limit, method, and path. This helps monitor if we need to adjust concurrency.
  - **Requirements**: REQ-004, REQ-011
  - **Design ref**: Section 3 "Discord.js Rate Limit Handling"
  - **Files**: backend/src/adapters/discord/DiscordAdapter.ts, backend/src/config/env.ts

- [ ] Task 20: Add channel sync job cleanup
  - **Prompt**: Add a cleanup method to backend/src/workers/syncWorker.ts that removes old completed channel_sync_jobs records older than 7 days. Run this after each successful sync to prevent the table from growing indefinitely. Use a single DELETE query with proper date filtering.
  - **Requirements**: REQ-006
  - **Design ref**: Section "Data Models"
  - **Files**: backend/src/workers/syncWorker.ts