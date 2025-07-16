# Requirements Document

## Introduction

The Platform Sync feature enables Verta to automatically pull and archive messages from tenant-connected platforms (starting with Discord). The system uses a platform-agnostic architecture with adapters, BullMQ for job orchestration, and granular per-channel progress tracking. Only user IDs are anonymized for privacy, while channel and message IDs are stored as-is. The system uses simple error handling (log and bail out) with no complex recovery mechanisms.

## Requirements

### Requirement 1

**User Story:** As a tenant administrator, I want my Discord server messages to be automatically synced hourly, so that I have a persistent archive of all communications.

#### Acceptance Criteria

1. WHEN a tenant has platform set to "discord" THEN the system SHALL schedule an hourly sync job for that tenant
2. WHEN the daily sync job executes THEN the system SHALL paginate through all channels visible by @everyone including text channels, threads, and forum channels
3. WHEN processing channels THEN the system SHALL pull all messages from each channel type (text channels, threads, forum posts and their replies)
4. WHEN storing data THEN the system SHALL anonymize only user IDs using a one-way hash function
5. IF a sync is interrupted or fails THEN the system SHALL track the last successful sync point
6. WHEN the next sync runs THEN the system SHALL resume from the last successful sync point

### Requirement 2

**User Story:** As a tenant administrator, I want to manually trigger a Discord sync via API, so that I can get immediate updates when needed.

#### Acceptance Criteria

1. WHEN I make a POST request to `/api/tenants/{tenantId}/sync` THEN the system SHALL trigger an immediate sync job
2. WHEN the manual sync is triggered THEN the system SHALL return a job ID for tracking
3. WHEN the sync job is queued THEN the system SHALL prevent duplicate sync jobs for the same tenant
4. WHEN the manual sync completes THEN the system SHALL update the tenant's last sync timestamp

### Requirement 3

**User Story:** As a system administrator, I want new Discord tenants to be synced immediately upon creation, so that their data is available right away.

#### Acceptance Criteria

1. WHEN a tenant is created with platform "discord" THEN the system SHALL immediately queue a sync job
2. WHEN the initial sync job is queued THEN the system SHALL set the tenant's sync status to "pending"
3. WHEN the initial sync completes successfully THEN the system SHALL set up the daily recurring sync schedule
4. IF the initial sync fails THEN the system SHALL retry with exponential backoff

### Requirement 4

**User Story:** As a developer, I want Discord channels and messages stored in the database with proper relationships, so that the data can be queried efficiently.

#### Acceptance Criteria

1. WHEN syncing channels THEN the system SHALL store channel data with platform IDs, names, types (text, thread, forum), and metadata
2. WHEN syncing messages THEN the system SHALL store message content, timestamps, and anonymized author IDs
3. WHEN storing relationships THEN the system SHALL maintain foreign key relationships between tenants, channels, and messages
4. WHEN anonymizing user IDs THEN the system SHALL use SHA-256 hashing without salt to ensure the same user ID always produces the same hash
5. WHEN storing data THEN the system SHALL include created_at and updated_at timestamps for audit purposes

### Requirement 5

**User Story:** As a system administrator, I want the sync process to be resilient and recoverable, so that temporary failures don't result in data loss or duplicate processing.

#### Acceptance Criteria

1. WHEN a sync job starts THEN the system SHALL record the sync start time and status
2. WHEN processing channels THEN the system SHALL track progress at the channel level
3. WHEN processing messages THEN the system SHALL track the last processed message timestamp per channel
4. IF a sync job fails THEN the system SHALL log the error details and mark the job as failed
5. WHEN a failed sync is retried THEN the system SHALL resume from the last successful checkpoint
6. WHEN a sync completes THEN the system SHALL update the tenant's last successful sync timestamp

### Requirement 6

**User Story:** As a system administrator, I want to monitor sync job status and performance, so that I can troubleshoot issues and ensure system health.

#### Acceptance Criteria

1. WHEN sync jobs are running THEN the system SHALL provide API endpoints to check job status
2. WHEN querying sync status THEN the system SHALL return job progress, estimated completion time, and any errors
3. WHEN sync jobs complete THEN the system SHALL log performance metrics including duration and message count
4. WHEN sync jobs fail THEN the system SHALL provide detailed error information via API
5. WHEN multiple sync jobs are queued THEN the system SHALL provide queue status and position information

### Requirement 7

**User Story:** As a system architect, I want the sync system to be platform-agnostic, so that adding Slack support in the future is straightforward.

#### Acceptance Criteria

1. WHEN designing the system THEN the system SHALL use a platform adapter pattern to abstract platform differences
2. WHEN storing data THEN the system SHALL use generic tables (channels, messages) with platform-specific metadata in JSONB fields
3. WHEN implementing Discord sync THEN the system SHALL use a DiscordAdapter that implements the PlatformAdapter interface
4. WHEN adding future platforms THEN the system SHALL only require implementing a new platform adapter
5. WHEN processing sync jobs THEN the system SHALL use platform-agnostic service layer that works with any adapter

### Requirement 8

**User Story:** As a system administrator, I want simple error handling that doesn't complicate the system, so that failures are logged but don't block other operations.

#### Acceptance Criteria

1. WHEN a sync encounters an error THEN the system SHALL log the error details to database and console
2. WHEN an error occurs THEN the system SHALL bail out of the current operation without complex recovery
3. WHEN a sync fails THEN the system SHALL rely on the next scheduled sync to retry the operation
4. WHEN logging errors THEN the system SHALL store error details in the sync progress table
5. WHEN multiple channels are being synced THEN errors in one channel SHALL NOT block other channels from syncing

### Requirement 9

**User Story:** As a system administrator, I want granular sync progress tracking, so that large channels with millions of messages can be synced efficiently.

#### Acceptance Criteria

1. WHEN syncing channels THEN the system SHALL track progress at the individual channel level
2. WHEN processing messages THEN the system SHALL process messages in batches of 1000 with progress updates
3. WHEN storing progress THEN the system SHALL record the last processed message ID and timestamp per channel
4. WHEN resuming sync THEN the system SHALL continue from the exact last processed message per channel
5. WHEN a channel has millions of messages THEN the system SHALL handle interruption and resume without reprocessing messages

### Requirement 10

**User Story:** As a data analyst, I want to track message replies, so that I can analyze conversation threads and user interactions.

#### Acceptance Criteria

1. WHEN person A replies to person B's message THEN the system SHALL store the reply relationship with anonymized user IDs
2. WHEN storing message replies THEN the system SHALL track the original message and the replying message
3. WHEN syncing messages THEN the system SHALL maintain the reply-to relationships between messages
4. WHEN storing reply data THEN the system SHALL anonymize both the original author and the replying user
5. WHEN processing threads THEN the system SHALL preserve the conversation hierarchy

### Requirement 12

**User Story:** As a data analyst, I want to track emoji reactions to messages, so that I can analyze user engagement and sentiment.

#### Acceptance Criteria

1. WHEN a user reacts with an emoji to a message THEN the system SHALL store the emoji reaction with anonymized user ID
2. WHEN storing standard emoji reactions THEN the system SHALL store the standard emoji character
3. WHEN storing custom emoji reactions THEN the system SHALL store the custom emoji string identifier
4. WHEN syncing messages THEN the system SHALL include all emoji reactions associated with each message
5. WHEN a user removes an emoji reaction THEN the system SHALL reflect the current state of reactions during sync

### Requirement 11

**User Story:** As a content manager, I want to track message attachments, so that I have metadata about files shared in conversations.

#### Acceptance Criteria

1. WHEN a message contains attachments THEN the system SHALL store attachment metadata and URLs
2. WHEN storing attachments THEN the system SHALL NOT download the actual files
3. WHEN syncing attachments THEN the system SHALL store filename, file size, content type, and platform-provided URL
4. WHEN attachments are present THEN the system SHALL maintain the relationship between messages and their attachments
5. WHEN storing attachment URLs THEN the system SHALL use the URLs provided by the platform

### Requirement 13

**User Story:** As a system administrator, I want to use a single Discord bot for all tenants, so that configuration is simplified and centralized.

#### Acceptance Criteria

1. WHEN configuring Discord integration THEN the system SHALL use one Discord bot token configured via environment variables
2. WHEN syncing multiple tenants THEN the system SHALL use the same Discord bot for all Discord tenants
3. WHEN authenticating with Discord THEN the system SHALL use the centrally configured bot token
4. WHEN a tenant is created THEN the system SHALL NOT require tenant-specific Discord bot configuration
5. WHEN accessing Discord guilds THEN the system SHALL ensure the single bot has access to all required tenant guilds

### Requirement 14

**User Story:** As a system administrator, I want simple rate limit handling, so that the system gracefully handles Discord API limits without complex tracking.

#### Acceptance Criteria

1. WHEN making Discord API calls THEN the system SHALL NOT implement internal rate limit tracking
2. WHEN Discord returns a rate limit error THEN the system SHALL exit the current sync operation
3. WHEN a rate limit error occurs THEN the system SHALL rely on the next scheduled sync to retry
4. WHEN handling rate limits THEN the system SHALL log the rate limit error for monitoring
5. WHEN rate limited THEN the system SHALL NOT attempt immediate retries or complex backoff strategies

### Requirement 15

**User Story:** As a system administrator, I want simple error recovery with limited retries, so that transient errors are handled without infinite retry loops.

#### Acceptance Criteria

1. WHEN a sync operation encounters an error THEN the system SHALL implement exponential backoff retry logic
2. WHEN retrying failed operations THEN the system SHALL attempt a maximum of 3 retries
3. WHEN calculating retry delays THEN the system SHALL use exponential backoff (1s, 2s, 4s)
4. WHEN all 3 retries fail THEN the system SHALL bail out and log the final error
5. WHEN bailing out after retries THEN the system SHALL rely on the next scheduled sync to retry the operation
