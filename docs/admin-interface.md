# Admin Interface Documentation

## Overview

The Verta admin interface provides a secure way to manage question clusters and golden answers. It consists of:

1. **Protected Admin Pages** - Web interface at `/admin`
2. **Admin API Endpoints** - RESTful API for programmatic access
3. **Authentication Layer** - Basic Auth for web, API Key for backend

## Architecture

```
┌─────────────┐     Basic Auth     ┌──────────────┐     X-API-KEY     ┌─────────────┐
│   Browser   │ ──────────────────> │  Next.js     │ ───────────────> │  Express    │
│             │                      │  /admin/*    │                   │  /api/admin │
└─────────────┘                      └──────────────┘                   └─────────────┘
                                            │                                   │
                                            └───────────────┬───────────────────┘
                                                            │
                                                        ┌───▼───┐
                                                        │ TiDB  │
                                                        └───────┘
```

## Authentication

### Web Interface (Basic Auth)

The admin pages use HTTP Basic Authentication via Next.js middleware:

```typescript
// frontend/middleware.ts
if (request.nextUrl.pathname.startsWith('/admin')) {
  const authHeader = request.headers.get('authorization');
  // Validates against ADMIN_API_KEY environment variable
}
```

Default credentials:
- Username: `admin`
- Password: `ikbeneenaap` (or value of `ADMIN_API_KEY`)

### API Endpoints (API Key)

Backend API requires `X-API-KEY` header:

```javascript
// Example API call
fetch('/api/admin/clusters', {
  headers: {
    'X-API-KEY': 'ikbeneenaap'
  }
})
```

## Admin Pages

### Clusters List Page (`/admin`)

Displays all question clusters with:
- Representative text
- Thread title
- Instance count (popularity)
- Golden answer status
- Last seen date
- Sorting by instance count or date
- Pagination (20 per page)

Features:
- Click column headers to sort
- Click cluster row to view details
- Real-time data refresh

### Cluster Detail Page (`/admin/clusters/[id]`)

Shows detailed information about a specific cluster:

**Cluster Information:**
- Representative text (main question)
- Thread title (original context)
- Instance count (times asked)
- First/last seen dates

**Golden Answer Management:**
- Markdown editor with live preview
- Format toggle (markdown/plaintext)
- Save/update/delete functionality
- Markdown sanitization for security

**Question Instances:**
- All variations of the question
- Original and rephrased text
- Confidence scores
- Thread links

## API Endpoints

### GET /api/admin/clusters

Get paginated list of question clusters.

**Query Parameters:**
- `tenant_id` (string): Filter by tenant
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 20, max: 100)
- `sort_by` (string): Sort field - `instance_count`, `last_seen_at`, `created_at`
- `sort_order` (string): Sort direction - `asc` or `desc`

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "tenant_id": "uuid",
      "representative_text": "How do I configure X?",
      "thread_title": "Configuration Help",
      "instance_count": 42,
      "first_seen_at": "2024-01-01T00:00:00Z",
      "last_seen_at": "2024-01-15T00:00:00Z",
      "has_golden_answer": true,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-15T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### GET /api/admin/clusters/:id

Get detailed information about a specific cluster.

**Response:**
```json
{
  "cluster": {
    "id": "uuid",
    "tenant_id": "uuid",
    "representative_text": "How do I configure X?",
    "thread_title": "Configuration Help",
    "instance_count": 42,
    "first_seen_at": "2024-01-01T00:00:00Z",
    "last_seen_at": "2024-01-15T00:00:00Z",
    "metadata": {},
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-15T00:00:00Z"
  },
  "golden_answer": {
    "id": "uuid",
    "answer": "## Configuration Guide\n\nFollow these steps...",
    "answer_format": "markdown",
    "created_by": "admin",
    "created_at": "2024-01-10T00:00:00Z",
    "updated_at": "2024-01-10T00:00:00Z"
  },
  "instances": [
    {
      "id": "uuid",
      "thread_id": "uuid",
      "thread_title": "Need help with config",
      "original_text": "How can I configure X?",
      "rephrased_text": "How do I configure X?",
      "confidence_score": 0.95,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

**Error Responses:**
- `400` - Invalid cluster ID format
- `404` - Cluster not found
- `401` - Unauthorized (missing/invalid API key)

### POST /api/admin/clusters/:id/golden-answer

Create or update a golden answer for a cluster.

**Request Body:**
```json
{
  "answer": "## Answer\n\nThis is the answer with **markdown**",
  "answer_format": "markdown",
  "created_by": "admin"
}
```

**Parameters:**
- `answer` (string, required): The answer text
- `answer_format` (string): Either "markdown" or "plaintext" (default: "markdown")
- `created_by` (string): User identifier (default: "admin")

**Response:**
```json
{
  "message": "Golden answer saved successfully",
  "golden_answer": {
    "id": "uuid",
    "cluster_id": "uuid",
    "answer": "## Answer\n\nThis is the answer with **markdown**",
    "answer_format": "markdown",
    "created_by": "admin",
    "created_at": "2024-01-10T00:00:00Z",
    "updated_at": "2024-01-10T00:00:00Z"
  }
}
```

**Notes:**
- Creates new answer if none exists
- Updates existing answer (upsert operation)
- Markdown is automatically sanitized
- Dangerous HTML/scripts are removed

### DELETE /api/admin/clusters/:id/golden-answer

Delete a golden answer from a cluster.

**Response:**
```json
{
  "message": "Golden answer deleted successfully"
}
```

**Error Responses:**
- `404` - Golden answer not found
- `401` - Unauthorized

## Markdown Support

### Allowed Markdown Features

The following markdown features are supported and sanitized:

- **Text Formatting**: Bold (`**text**`), italic (`*text*`), strikethrough (`~~text~~`)
- **Headings**: All levels (`# H1` through `###### H6`)
- **Lists**: Ordered (`1. item`) and unordered (`- item`)
- **Links**: `[text](url)` - only http/https URLs allowed
- **Code**: Inline `` `code` `` and blocks ` ```code``` `
- **Blockquotes**: `> quote`
- **Horizontal Rules**: `---`
- **Line Breaks**: Two spaces at end of line

### Security Features

- **XSS Prevention**: All `<script>` tags removed
- **Dangerous URLs Blocked**: No `javascript:`, `data:`, or `file:` URLs
- **HTML Sanitization**: Only safe HTML tags allowed
- **Event Handlers Removed**: All `on*` attributes stripped

### Example Golden Answer

```markdown
## Problem Solution

This issue occurs when the configuration is incorrect.

### Steps to Fix:

1. Open the configuration file
2. Update the following settings:
   - `setting1`: Change to **value1**
   - `setting2`: Change to *value2*

### Code Example:

```json
{
  "setting1": "value1",
  "setting2": "value2"
}
```

> **Note**: Remember to restart the service after changes.

For more information, see [the documentation](https://example.com/docs).
```

## Frontend Components

### AdminLayout

Wrapper component providing:
- Navigation header
- Error boundary
- Logout functionality

### GoldenAnswerEditor

Markdown editor with:
- Live preview toggle
- Format selection (markdown/plaintext)
- Save/cancel actions
- Syntax highlighting

### ErrorBoundary

Catches React errors and provides:
- User-friendly error messages
- Retry functionality
- Debug information (development mode)

## Performance Considerations

### Database Indexes

Optimized queries with indexes on:
- `question_clusters.tenant_id`
- `question_clusters.instance_count`
- `golden_answers.cluster_id` (unique)

### Caching Strategy

- No caching on admin endpoints (always fresh data)
- FAQ endpoints cached for 5 minutes
- Redis used for cache storage

### Query Optimization

- Paginated results (max 100 per request)
- Selective field projection
- Efficient JOIN operations

## Error Handling

### API Error Format

All errors follow consistent format:

```json
{
  "error": "Error type",
  "message": "Detailed error message",
  "timestamp": "2024-01-10T00:00:00.000Z"
}
```

### Retry Logic

Frontend API client includes:
- Automatic retry for network errors
- Exponential backoff (1s, 2s, 4s)
- Maximum 3 retry attempts
- User-friendly error messages

## Testing

### Integration Tests

Located in: `backend/src/routes/api/admin/__tests__/`

Test coverage includes:
- Authentication validation
- CRUD operations
- Data validation
- Markdown sanitization
- Full workflow (admin → FAQ)

Run tests:
```bash
npx vitest run src/routes/api/admin/__tests__/clusters.integration.test.ts
```

### Manual Testing

1. **Authentication Test:**
   ```bash
   # Should return 401
   curl http://localhost:25000/api/admin/clusters
   
   # Should return 200
   curl -H "X-API-KEY: ikbeneenaap" http://localhost:25000/api/admin/clusters
   ```

2. **Golden Answer Creation:**
   ```bash
   curl -X POST -H "X-API-KEY: ikbeneenaap" \
     -H "Content-Type: application/json" \
     -d '{"answer": "Test answer"}' \
     http://localhost:25000/api/admin/clusters/{id}/golden-answer
   ```

3. **FAQ Verification:**
   ```bash
   # Check if answer appears in FAQ
   curl http://localhost:25000/api/v1/faq
   ```

## Deployment Considerations

### Environment Variables

Required for production:

```env
# Backend
ADMIN_API_KEY=secure-random-string
DATABASE_URL=mysql://user:pass@host:port/db
REDIS_HOST=redis-server
REDIS_PORT=6379

# Frontend
NEXT_PUBLIC_API_URL=https://api.example.com
```

### Security Checklist

- [ ] Change default ADMIN_API_KEY
- [ ] Use HTTPS in production
- [ ] Enable rate limiting
- [ ] Set up monitoring/alerting
- [ ] Regular security updates
- [ ] Database backups

### Monitoring

Key metrics to track:
- API response times
- Error rates
- Cache hit ratio
- Database query performance
- Authentication failures

## Troubleshooting

### Common Issues

1. **"Unauthorized" errors:**
   - Check API key in environment
   - Verify headers are sent correctly
   - Clear browser cache for Basic Auth

2. **"Cluster not found":**
   - Verify cluster ID is valid UUID
   - Check tenant_id if using filters
   - Ensure cluster exists in database

3. **Markdown not rendering:**
   - Check answer_format is "markdown"
   - Verify rehype-sanitize is installed
   - Check for console errors

4. **Slow performance:**
   - Check database indexes
   - Verify Redis is running
   - Monitor query execution times

### Debug Mode

Enable debug logging:

```bash
# Backend
DEBUG=verta:* npm run dev

# View SQL queries
DEBUG=kysely:* npm run dev
```

## Future Enhancements

Planned improvements:

1. **Bulk Operations**: Edit multiple golden answers
2. **Version History**: Track answer changes
3. **Rich Text Editor**: WYSIWYG markdown editing
4. **Export/Import**: Backup golden answers
5. **Analytics Dashboard**: Usage statistics
6. **Multi-language Support**: i18n for answers
7. **Approval Workflow**: Review before publishing
8. **Search**: Full-text search in answers