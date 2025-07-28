# Sync Process Optimization Design

## Overview

This design document outlines the implementation strategy for optimizing the Discord sync process through parallelization and improved API utilization. The primary goal is to reduce sync times by processing multiple channels concurrently while leveraging Discord.js's built-in rate limit handling.

## Architecture

### Current Architecture Issues

1. **Sequential Processing**: Channels are processed one-by-one in a for loop
2. **Single Worker Concurrency**: Worker processes only one sync job at a time
3. **Suboptimal Batch Sizes**: Not utilizing Discord's maximum allowed batch sizes
4. **No Channel-Level Parallelism**: Each channel's messages are fetched sequentially

### Proposed Architecture

```
┌─────────────────┐
│   Sync Service  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│  Master Sync    │────▶│  Channel Queue   │
│    Worker       │     └──────────────────┘
└────────┬────────┘              │
         │                       ▼
         │              ┌──────────────────┐
         │              │ Channel Workers  │
         │              │   (Pool of N)    │
         │              └──────────────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌──────────────────┐
│ Progress Tracker│◀────│ Discord.js Client│
└─────────────────┘     └──────────────────┘
```

**Key Changes:**
- Multiple channel workers process channels in parallel
- Discord.js handles all rate limiting internally
- No custom rate limit manager needed

## Components and Interfaces

### 1. Enhanced Sync Queue System

**Current**: Single `syncQueue` for tenant sync jobs

**New**: Two-tier queue system
- **Master Queue**: Handles tenant-level sync jobs
- **Channel Queue**: Handles individual channel sync tasks

```typescript
interface ChannelSyncJobData {
  tenantId: string;
  channelId: string;
  platformChannelId: string;
  syncType: 'full' | 'incremental';
  startDate?: Date;
  endDate?: Date;
  parentJobId: string; // Reference to master sync job
}
```

### 2. Parallel Channel Worker Pool

**Configuration**:
```typescript
interface SyncWorkerConfig {
  maxChannelWorkers: number;      // Default: 10
  channelBatchSize: number;        // Default: 5  
  messageFetchSize: number;        // Default: 100 (Discord max)
  retryDelayMs: number;           // Default: 1000
}
```

### 3. Discord.js Rate Limit Handling

Discord.js v14 automatically handles rate limiting:
- Queues requests internally when rate limits are hit
- Respects X-RateLimit-* headers from Discord API
- No manual rate limit tracking needed

We can optionally listen for rate limit events:
```typescript
// Optional: Monitor rate limits for logging/metrics
client.rest.on('rateLimited', (info) => {
  logger.warn('Rate limited', {
    timeout: info.timeout,
    limit: info.limit,
    method: info.method,
    path: info.path
  });
});
```

### 4. Progress Tracking Enhancement

Modified `sync_progress` table structure:
```sql
-- Add new columns for parallel tracking
ALTER TABLE sync_progress ADD COLUMN worker_id varchar(50);
ALTER TABLE sync_progress ADD COLUMN started_at timestamp;
ALTER TABLE sync_progress ADD COLUMN messages_per_second numeric;
ALTER TABLE sync_progress ADD COLUMN retry_count integer DEFAULT 0;

-- Add index for worker assignment
CREATE INDEX idx_sync_progress_worker ON sync_progress(worker_id, status);
```

## Data Models

### Channel Sync State
```typescript
interface ChannelSyncState {
  channelId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  workerId?: string;
  startedAt?: Date;
  completedAt?: Date;
  messagesProcessed: number;
  lastMessageId?: string;
  error?: string;
  retryCount: number;
}
```

### Sync Job Result Enhancement
```typescript
// Update existing SyncJobResult interface
interface SyncJobResult {
  tenantId: string;
  channelsProcessed: number;
  messagesProcessed: number;
  reactionsProcessed: number;
  attachmentsProcessed: number;
  errors: Array<{
    channelId?: string;
    error: string;
    timestamp: Date;
  }>;
  startedAt: Date;
  completedAt: Date;
  // New fields for parallel processing
  parallelStats?: {
    maxConcurrentChannels: number;
    averageChannelTime: number;
    totalApiCalls: number;
    rateLimitEncounters: number;
  };
  channelResults?: ChannelSyncState[];
}
```

## Implementation Details

### 1. Master Sync Worker Flow

```typescript
async processSyncJob(job: Job<SyncJobData>) {
  // 1. Fetch all channels (Discord.js handles rate limits)
  const channels = await adapter.fetchChannels(platformId);
  
  // 2. Create channel sync jobs in batches
  const channelJobs = channels.map(channel => ({
    tenantId: job.data.tenantId,
    channelId: channel.id,
    platformChannelId: channel.platformChannelId,
    syncType: job.data.syncType,
    parentJobId: job.id
  }));
  
  // 3. Add to channel queue
  await channelQueue.addBulk(
    channelJobs.map(data => ({
      name: 'sync-channel',
      data,
      opts: { priority: calculatePriority(data) }
    }))
  );
  
  // 4. Monitor progress
  return this.monitorChannelProgress(job.id, channelJobs);
}
```

### 2. Channel Worker Implementation

```typescript
class ChannelSyncWorker {
  async processChannel(job: Job<ChannelSyncJobData>) {
    const { channelId, platformChannelId, syncType } = job.data;
    
    // 1. Claim channel for this worker
    await this.claimChannel(channelId, this.workerId);
    
    // 2. Get last sync point
    const checkpoint = await this.getLastCheckpoint(channelId);
    
    // 3. Fetch messages (Discord.js handles rate limiting)
    const messages = await this.fetchMessages({
      platformChannelId,
      afterMessageId: checkpoint?.lastMessageId,
      batchSize: this.config.messageFetchSize
    });
    
    // 4. Process messages in batches
    await this.processMessageBatches(messages);
    
    // 5. Update progress
    await this.updateProgress(channelId, messages);
  }
}
```

### 3. Message Fetching

```typescript
async fetchMessages(options: FetchOptions) {
  let hasMore = true;
  let afterId = options.afterMessageId;
  const allMessages = [];
  
  while (hasMore) {
    // Discord.js automatically queues and rate limits this call
    const result = await adapter.fetchMessages(options.platformChannelId, {
      afterMessageId: afterId,
      limit: this.config.messageFetchSize // Use max batch size (100)
    });
    
    allMessages.push(...result.messages);
    hasMore = result.hasMore;
    afterId = result.checkpoint?.lastMessageId;
  }
  
  return allMessages;
}
```

## Error Handling

### Rate Limit Handling
1. Discord.js automatically handles rate limits
2. Optional: Listen for 'rateLimited' events for monitoring
3. Adjust worker concurrency if excessive rate limits occur

### Channel Failure Isolation
1. Failed channels don't affect others
2. Automatic retry with backoff
3. Dead letter queue for persistent failures

### Progress Recovery
1. Each channel tracks its own progress
2. Resume from last successful checkpoint
3. No duplicate message processing

## Testing Strategy

### Unit Tests
- Channel worker isolation
- Progress tracking accuracy
- Concurrent job processing

### Integration Tests
- Parallel channel processing
- Rate limit compliance
- Error recovery scenarios

### Performance Tests
- Measure sync time improvements
- Monitor memory usage under load
- Verify rate limit adherence

## Migration and Rollout

### Database Migration

#### Migration 007_add_channel_sync_tracking.ts

1. **Create channel_sync_jobs table**:
```sql
CREATE TABLE channel_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  parent_job_id VARCHAR(255) NOT NULL,
  worker_id VARCHAR(50),
  status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  messages_processed INTEGER DEFAULT 0,
  error_details JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_channel_sync_jobs_tenant ON channel_sync_jobs(tenant_id);
CREATE INDEX idx_channel_sync_jobs_parent ON channel_sync_jobs(parent_job_id);
CREATE INDEX idx_channel_sync_jobs_worker ON channel_sync_jobs(worker_id, status);
```

2. **Update sync_progress table**:
```sql
ALTER TABLE sync_progress 
  ADD COLUMN worker_id VARCHAR(50),
  ADD COLUMN started_at TIMESTAMP,
  ADD COLUMN messages_per_second NUMERIC;

-- Add index for worker queries
CREATE INDEX idx_sync_progress_worker ON sync_progress(worker_id, status);
```

### Configuration Migration
```typescript
// New environment variables
SYNC_MAX_CHANNEL_WORKERS=10
SYNC_CHANNEL_BATCH_SIZE=5
SYNC_MESSAGE_FETCH_SIZE=100
```

### Rollout Strategy
1. Deploy with conservative defaults (5 workers)
2. Monitor performance and errors
3. Gradually increase concurrency
4. Full rollout with optimized settings

## Developer Experience

### New NPM Scripts

```json
// Add to package.json scripts
{
  "sync:start": "tsx scripts/sync-start.ts",
  "sync:reset": "tsx scripts/sync-reset.ts",
  "sync:status": "tsx scripts/sync-status.ts"
}
```

### CLAUDE.md Updates

Add to CLAUDE.md:
```markdown
## Sync Management Commands

# Start sync for all tenants
npm run sync:start

# Start sync for specific tenant
npm run sync:start -- --tenant=takaro

# Reset sync progress (requires confirmation)
npm run sync:reset -- --tenant=takaro

# Check sync status
npm run sync:status -- --job-id=<job-id>
```

## Performance Projections

Based on the design:
- **Sequential**: 100 channels × 10s/channel = 1000s (16.7 min)
- **Parallel (10 workers)**: 100 channels ÷ 10 workers × 10s = 100s (1.7 min)
- **Expected improvement**: 90% reduction in sync time

## Security Considerations

1. No changes to data anonymization
2. Discord.js handles rate limits automatically
3. Worker isolation prevents cascade failures
4. Audit logging for all sync operations