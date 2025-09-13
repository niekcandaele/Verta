# Implementation Tasks: Discord Bot Autoresponder

## Overview
Building Discord bot functionality to automatically respond to threads and handle slash commands. The implementation extends the existing Discord.js infrastructure to add interactive capabilities while maintaining the current sync functionality.

We'll implement this in 5 phases:
1. **Infrastructure Setup** ✅ - Update Discord intents and create basic service structure
2. **Slash Commands** ✅ - Implement `/ask` and `/help` commands with hardcoded responses
3. **Search Integration** ✅ - Connect to real search service and format responses
4. **Thread Auto-Response** ✅ - Add thread monitoring with debounce logic
5. **Admin Configuration** ✅ COMPLETED - Enable channel selection and finalize all features

**Current Status**: ALL PHASES COMPLETED ✅ - Full Discord bot functionality implemented with enhanced search capabilities, multi-step search, document expansion, LLM-guided query refinement, and admin configuration interface.

**Implementation Note**: Phase 5 required TiDB-specific migration fixes:
- Changed UUID columns from `uuid` to `varchar(36)`
- Fixed timestamp defaults to use `sql`CURRENT_TIMESTAMP``
- Removed default value from JSON column (TiDB limitation)
- Application-level UUID generation via `uuidv4()`

## Phase 1: Infrastructure Setup ✅ COMPLETED
**Goal**: Update Discord.js client with required intents and create basic service structure
**Demo**: "At standup, I can show: The bot is online with new intents and slash commands are registered in Discord"

### Tasks
- [x] Task 1.1: Update DiscordClientManager with thread intents
  - **Output**: Discord client connects with thread permissions
  - **Files**: `backend/src/adapters/discord/DiscordClientManager.ts`
  - **Verify**: Check logs show "Global Discord client initialized successfully" with no errors

- [x] Task 1.2: Create DiscordBotService skeleton
  - **Output**: Basic service that connects to Discord client
  - **Files**: `backend/src/services/discord/DiscordBotService.ts`
  - **Verify**: Service initializes without errors

- [x] Task 1.3: Create bot event queue
  - **Output**: BullMQ queue for bot events
  - **Files**: `backend/src/queues/botEventQueue.ts`
  - **Verify**: Queue connects to Redis successfully

- [x] Task 1.4: Register slash commands with Discord
  - **Output**: `/ask` and `/help` commands visible in Discord
  - **Files**: Update `DiscordBotService.ts` with command registration
  - **Verify**: Commands appear in Discord UI when typing `/`

- [x] Task 1.5: Update service initialization
  - **Output**: DiscordBotService starts with app
  - **Files**: `backend/src/index.ts`
  - **Verify**: Bot stays online and commands remain registered

### Phase 1 Checkpoint
- [x] Run lint: `npm run lint`
- [x] Run build: `npm run build`
- [x] Run tests: `npm test`
- [x] Manual verification: Type `/` in Discord and see both commands
- [x] **Demo ready**: Show registered commands and bot online status

## Phase 2: Basic Slash Commands ✅ COMPLETED
**Goal**: Implement working slash commands with hardcoded responses
**Demo**: "At standup, I can show: `/ask` returns a hardcoded response and `/help` shows usage info"

### Tasks
- [x] Task 2.1: Implement slash command handlers
  - **Depends on**: 1.5
  - **Output**: Bot responds to `/ask` and `/help` commands
  - **Files**: Update `backend/src/services/discord/DiscordBotService.ts`
  - **Verify**: `/ask test question` returns hardcoded response

- [x] Task 2.2: Create BotEventWorker skeleton
  - **Output**: Worker processes queued events
  - **Files**: `backend/src/workers/botEventWorker.ts`
  - **Verify**: Worker starts and connects to queue

- [x] Task 2.3: Queue slash command events
  - **Depends on**: 2.1, 2.2
  - **Output**: Commands queued and processed asynchronously
  - **Files**: Update `DiscordBotService.ts` to queue events
  - **Verify**: See queue job created in logs

- [x] Task 2.4: Implement ephemeral responses
  - **Output**: Channel commands reply privately, thread commands publicly
  - **Files**: Update command handlers in `DiscordBotService.ts`
  - **Verify**: Test in both channel and thread contexts
  - **Note**: Modified to always use public responses for better support visibility

### Phase 2 Checkpoint
- [x] Run quality checks
- [x] Test both commands work
- [x] Verify ephemeral behavior (changed to always public)
- [x] **Demo ready**: Show working `/ask` and `/help` with appropriate visibility

## Phase 3: Search Integration ✅ COMPLETED
**Goal**: Connect slash commands to real search and ML services
**Demo**: "At standup, I can show: `/ask` returns real search results with sources and confidence"

### Tasks
- [x] Task 3.1: Create ResponseGeneratorService
  - **Output**: Service that orchestrates search and response generation
  - **Files**: `backend/src/services/ResponseGeneratorService.ts`
  - **Verify**: Unit tests pass for response generation logic

- [x] Task 3.2: Extend SearchService with multi-query support
  - **Depends on**: 3.1
  - **Output**: Search service can handle multiple queries
  - **Files**: `backend/src/services/SearchService.ts`
  - **Verify**: Multi-query search returns combined results
  - **Note**: Added excludeMessages parameter to skip message searches

- [x] Task 3.3: Integrate ML service for response generation
  - **Depends on**: 3.2
  - **Output**: Responses generated via Gemini Flash
  - **Files**: Update `ResponseGeneratorService.ts`
  - **Verify**: Responses are natural language, not raw results
  - **Note**: Updated to use Gemini 2.5 Pro for larger context window

- [x] Task 3.4: Format Discord responses with sources
  - **Depends on**: 3.3
  - **Output**: Formatted messages with confidence and sources
  - **Files**: Update `BotEventWorker.ts` to use ResponseGeneratorService
  - **Verify**: `/ask` shows formatted response with sources
  - **Note**: Added clickable URLs and source deduplication

- [x] Task 3.5: Handle search errors gracefully
  - **Output**: Appropriate error messages for various failures
  - **Files**: Update error handling in `BotEventWorker.ts`
  - **Verify**: Test with ML service down, no results, etc.

### Phase 3 Checkpoint
- [x] Integration tests pass
- [x] Real search results displayed
- [x] Error scenarios handled
- [x] **Demo ready**: Show `/ask` with real search, sources, and confidence levels

## Phase 4: Thread Auto-Response ✅ COMPLETED
**Goal**: Implement automatic responses to new threads with debounce logic
**Demo**: "At standup, I can show: Bot waits 10 seconds then responds to new threads automatically"

### Tasks
- [x] Task 4.1: Add thread event handler
  - **Output**: Bot detects new thread creation
  - **Files**: Update `DiscordBotService.ts` with ThreadCreate handler
  - **Verify**: Logs show thread detection

- [x] Task 4.2: Implement debounce timer logic
  - **Depends on**: 4.1
  - **Output**: 10-second timer that resets on new messages
  - **Files**: Add timer management to `DiscordBotService.ts`
  - **Verify**: Timer resets when messages added to thread

- [x] Task 4.3: Fetch thread context
  - **Output**: Bot retrieves all thread messages
  - **Files**: Update thread handler to fetch messages
  - **Verify**: Context includes all thread messages

- [x] Task 4.4: Process thread events in worker
  - **Depends on**: 4.3
  - **Output**: Thread responses generated and posted
  - **Files**: Update `BotEventWorker.ts` for thread events
  - **Verify**: Bot posts response after timer expires

- [x] Task 4.5: Add thread context to slash commands
  - **Output**: `/ask` in threads includes thread context
  - **Files**: Update slash command handler
  - **Verify**: Thread context improves response relevance

### Phase 4 Checkpoint
- [x] Thread auto-response works
- [x] Debounce timer functions correctly
- [x] Context improves responses
- [x] **Demo ready**: Create thread, add messages, see auto-response after 10 seconds

## Phase 5: Admin Configuration ✅ COMPLETED
**Goal**: Enable admin configuration of monitored channels
**Demo**: "At standup, I can show: Admins can select channels and bot only responds in those channels"

### Tasks
- [x] Task 5.1: Create bot_config database table
  - **Output**: Migration for bot configuration storage
  - **Files**: `backend/src/database/migrations/026_create_bot_config.ts`
  - **Verify**: Table created with correct schema

- [x] Task 5.2: Create BotConfigRepository
  - **Depends on**: 5.1
  - **Output**: Repository for bot configuration CRUD
  - **Files**: `backend/src/repositories/BotConfigRepository.ts`
  - **Verify**: Repository follows existing patterns with upsert method

- [x] Task 5.3: Implement admin API endpoints
  - **Depends on**: 5.2
  - **Output**: GET/PUT endpoints for bot config
  - **Files**: `backend/src/routes/api/admin/bot-config.ts`
  - **Verify**: Endpoints support channel validation and tenant isolation

- [x] Task 5.4: Load config in DiscordBotService
  - **Depends on**: 5.3
  - **Output**: Service checks monitored channels
  - **Files**: Update `DiscordBotService.ts`
  - **Verify**: Service uses database config with caching

- [x] Task 5.5: Add admin UI for channel selection
  - **Output**: Admin interface for selecting channels
  - **Files**: `frontend/pages/admin/bot-config.tsx`
  - **Verify**: UI provides channel selection with current status

### Phase 5 Checkpoint ✅ COMPLETED
**Implementation Details**:
- TiDB-compatible migration created with proper data types
- BotConfigRepository follows existing patterns with upsert functionality
- Admin API endpoints support full CRUD operations with validation
- DiscordBotService integrates database config with 5-minute caching
- Admin UI provides intuitive channel selection interface
- [x] Database migration applied
- [x] API endpoints functional
- [x] Channel filtering works
- [x] Admin UI operational
- [x] **Demo ready**: Configure channels in admin UI, verify bot only responds there

## Additional Enhancements Implemented ✅
Beyond the original plan, we implemented several significant improvements:

### Enhanced Search Capabilities
- [x] **Exclude Message Searches**: Modified to only search knowledge base and golden answers
  - Added `excludeMessages` parameter to SearchService
  - Improves response quality by focusing on curated content

### Smart Document Expansion
- [x] **Document Chunk Fetching**: Fetches all chunks for found documents
  - Created `fetchCompleteDocuments` method in ResponseGeneratorService
  - Provides complete context for better answers

### Multi-Step Search with LLM Guidance
- [x] **LLM-Guided Follow-up Queries**: 
  - Created `/api/ml/suggest-queries` endpoint in Python ML service
  - Added `suggestQueries` method to MlClientService
  - Implements 5-step search flow:
    1. Initial search with document expansion
    2. LLM suggests up to 5 follow-up queries
    3. Execute follow-up searches in parallel
    4. Expand follow-up results
    5. Generate final response with all context

### Model and Response Improvements
- [x] **Model Upgrades**: 
  - Started with Gemini Flash
  - Tested DeepSeek Chat v3
  - Final: Gemini 2.5 Pro for larger context window
- [x] **Response Formatting**:
  - Always public responses for support visibility
  - Clickable source URLs with deduplication
  - Knowledge base URLs point to source documents
  - Golden answer URLs point to FAQ section

### Technical Improvements
- [x] **Enhanced Context Handling**: Increased max_tokens to 2000 for Gemini 2.5 Pro
- [x] **Source Deduplication**: Smart URL grouping to avoid duplicate links
- [x] **Error Resilience**: Circuit breakers handle ML service failures gracefully

## Final Verification
- [x] All requirements from design doc met:
  - [x] REQ-001: Thread auto-response in configured channels (Phase 4 & 5)
  - [x] REQ-002: Multiple search queries executed
  - [x] REQ-003: Gemini Flash generates responses (upgraded to Gemini 2.5 Pro)
  - [x] REQ-004: `/ask` and `/help` commands work
  - [x] REQ-005: Thread context included (Phase 4)
  - [x] REQ-006: Confidence and sources shown
  - [x] REQ-007: Golden answers prioritized
  - [x] REQ-008: Rate limits handled
  - [x] REQ-009: Admin channel configuration (Phase 5)
  - [x] REQ-010: No context outside threads
  - [x] REQ-011: 10-second debounce (Phase 4)
- [ ] All obsolete code removed (none for this feature)
- [ ] Tests comprehensive
- [ ] Documentation updated
- [ ] Performance requirements met
- [ ] Security validations in place