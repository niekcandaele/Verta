# Verta Discord Sync Guide

## Trigger Sync
```bash
# Sync all tenants
npm run discord:sync

# Sync specific tenant
npm run discord:sync -- --tenant=takaro
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
PostgreSQL is available via MCP. Key tables: `tenants`, `channels`, `messages`, `sync_progress`