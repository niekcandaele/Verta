# Verta Discord Sync Guide

## Trigger Sync
```bash
# Sync all tenants
npm run discord:sync

# Sync specific tenant
npm run discord:sync -- --tenant=takaro
```

## Sync Management Commands (Coming Soon)
```bash
# Start sync for all tenants
npm run sync:start

# Start sync for specific tenant  
npm run sync:start -- --tenant=takaro

# Reset sync progress (requires confirmation)
npm run sync:reset -- --tenant=takaro

# Check sync status
npm run sync:status -- --job-id=<job-id>
```

## Development Scripts
```bash
# Create test tenant
npm run dev:data

# Reset test data
npm run dev:reset
```

## API Endpoints
- `POST /api/sync` - Start sync (requires X-API-Key: ikbeneenaap)
- `GET /api/sync/jobs/{jobId}` - Check job status
- `GET /api/tenants` - List all tenants

## Debug with Docker Logs
```bash
# Follow sync progress
docker logs -f verta-app 2>&1 | grep -E "sync|Processing|fetch"

# Check specific channel (e.g., forum)
docker logs verta-app 2>&1 | grep "1132905935224983622"

# Recent errors
docker logs verta-app --tail 100 2>&1 | grep -i error
```

## Database
TiDB is available via MCP. Key tables: `tenants`, `channels`, `messages`, `sync_progress`, `channel_sync_jobs`

### TiDB MCP Commands
- `show_databases` - List all databases
- `switch_database` - Switch to a different database
- `show_tables` - List all tables in current database
- `db_query` - Execute read-only SQL queries
- `db_execute` - Execute data modification SQL (INSERT, UPDATE, DELETE)
- `db_create_user` - Create database user
- `db_remove_user` - Remove database user