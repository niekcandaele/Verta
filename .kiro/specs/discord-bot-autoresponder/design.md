# Technical Design

## Architecture Overview

The Discord Bot Autoresponder extends Verta's existing Discord integration to add interactive capabilities. The system leverages the existing Discord.js client infrastructure while adding event handlers for thread creation and slash command interactions. All processing is handled asynchronously through BullMQ to ensure scalability and reliability.

```
Discord.js Client -> DiscordBotService -> BotEventWorker -> SearchService -> ML Service
      ^                    |                     |
      |                    v                     v
      |            CommandHandler          ResponseGenerator
      |                                          |
      +------------------------------------------+
                  (interaction.reply())
```

## Component Design

### DiscordBotService

**Location:** `backend/src/services/discord/DiscordBotService.ts`

The DiscordBotService acts as the main interface between Discord and our system. It:
- Registers Discord.js event handlers for thread creation and interactions
- Manages slash command registration via Discord REST API
- Implements debounce logic for thread responses
- Queues events for asynchronous processing

Key implementation details:
- Uses singleton pattern to ensure single instance
- Leverages existing Discord.js client from DiscordClientManager
- Implements 10-second debounce timer with Map-based tracking
- Handles both thread and interaction events

### BotEventWorker

**Location:** `backend/src/workers/botEventWorker.ts`

Processes queued Discord events asynchronously:
- Handles rate limiting and retry logic
- Coordinates between search and response generation
- Posts responses back to Discord
- Implements error handling with user-friendly messages

### ResponseGeneratorService

**Location:** `backend/src/services/ResponseGeneratorService.ts`

Orchestrates the response generation process:
- Performs multiple search queries (2-3) for comprehensive context
- Aggregates and ranks search results
- Prioritizes golden answers over general content
- Calls ML service (Gemini Flash) for natural language generation
- Formats responses with confidence levels and source attribution

### Required Discord.js Intents

The system requires additional Discord intents beyond current sync functionality:
```typescript
GatewayIntentBits.GuildMessageThreads,
GatewayIntentBits.GuildThreadMembers,
```

## Data Models

### BotEventJobData
```typescript
interface BotEventJobData {
  type: 'thread_create' | 'slash_command'
  tenantId: string
  channelId: string
  threadId?: string
  userId: string
  content: string
  context?: Message[]
  timestamp: Date
}
```

### BotConfig
```typescript
interface BotConfig {
  id: string
  tenantId: string
  monitoredChannels: string[]
  createdAt: Date
  updatedAt: Date
}
```

### BotResponse
```typescript
interface BotResponse {
  content: string
  confidence: 'high' | 'medium' | 'low'
  sources: Array<{
    type: 'golden_answer' | 'message'
    title: string
    url?: string
  }>
  searchResultCount: number
}
```

## Database Schema

### bot_config table
```sql
CREATE TABLE bot_config (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  monitored_channels JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE KEY uk_bot_config_tenant (tenant_id)
);
```

## Integration Points

### Search Service Enhancement

The SearchService requires minimal modification to support multi-query searches:
- Add method for executing multiple queries in parallel
- Support query variations for better coverage
- Maintain existing single-query interface for backward compatibility

### ML Service Integration

Uses existing ML service endpoints:
- `/generate` endpoint for response synthesis
- Sends aggregated search results as context
- Receives natural language response

### Discord Command Registration

Slash commands are registered globally per guild:
```javascript
const commands = [
  {
    name: 'ask',
    description: 'Ask Verta a question',
    options: [{
      name: 'question',
      type: 3, // STRING
      description: 'Your question',
      required: true
    }]
  },
  {
    name: 'help',
    description: 'Show Verta bot usage and tips'
  }
];
```

## Response Format

Standard response format for consistency:
```
📚 **Answer** (Confidence: High)
[Generated response text...]

**Sources:**
• [Golden Answer: FAQ Title]
• [Message: excerpt...] (link)

*Response generated from 3 search results*
```

## Security Considerations

- Validate bot permissions before responding (ViewChannel, SendMessages)
- Sanitize search queries to prevent injection attacks
- Use ephemeral responses for privacy in public channels
- Verify guild and member context for multi-tenant isolation
- No per-user rate limiting (rely on Discord's built-in moderation)

## Performance Optimizations

- Cache monitored channels configuration (5-minute TTL)
- Batch search queries for efficiency
- Use connection pooling for database queries
- Implement circuit breaker for ML service calls
- Queue-based processing prevents blocking

## Error Handling Strategy

- **Search service unavailable:** "I'm temporarily unable to search. Please try again in a few minutes."
- **No relevant results:** "I couldn't find relevant information for your question. Try rephrasing or check the documentation directly."
- **Response generation failure:** "I encountered an error generating a response. Please try again."
- **Discord API errors:** Log and retry with exponential backoff
- **Permission errors:** Silently fail with logged warning

## Testing Strategy

### Unit Tests
- Response generation logic with various search result combinations
- Debounce timer behavior
- Search query building and variation
- Discord message formatting

### Integration Tests
- Discord event handling flow
- Queue processing with retry logic
- Search service multi-query execution
- ML service integration

### End-to-End Tests
- Full flow from Discord event to posted response
- Slash command in different contexts (channel vs thread)
- Concurrent thread creation handling
- Configuration changes taking effect

### Load Tests
- Handle 100+ concurrent thread creations
- Maintain response time SLAs under load
- Queue behavior under stress
- Rate limit compliance

## Deployment Considerations

### Feature Flags
- `DISCORD_BOT_ENABLED`: Master switch for bot functionality
- `DISCORD_BOT_AUTO_RESPONSE`: Toggle automatic thread responses
- `DISCORD_BOT_SLASH_COMMANDS`: Toggle slash command functionality

### Rollout Strategy
1. **Phase 1:** Deploy with feature flags disabled
2. **Phase 2:** Enable in single test channel
3. **Phase 3:** Enable slash commands server-wide
4. **Phase 4:** Enable auto-responses in selected channels
5. **Phase 5:** Full rollout with admin configuration

### Monitoring
- Queue depth and processing times
- Discord API rate limit usage
- Response generation latency
- Error rates by type
- Search query performance

### Rollback Plan
- Feature flags allow instant disable
- Queue can be paused without data loss
- No database migrations to rollback
- Discord commands persist but become non-functional