# Verta - Discord Archive & FAQ System

[![CI Pipeline](https://github.com/niekcandaele/Verta/actions/workflows/ci.yml/badge.svg)](https://github.com/niekcandaele/Verta/actions/workflows/ci.yml)
[![Backend Image](https://ghcr-badge.egpl.dev/niekcandaele/verta-backend/latest_tag?label=backend)](https://github.com/niekcandaele/Verta/pkgs/container/verta-backend)
[![Frontend Image](https://ghcr-badge.egpl.dev/niekcandaele/verta-frontend/latest_tag?label=frontend)](https://github.com/niekcandaele/Verta/pkgs/container/verta-frontend)
[![ML Service Image](https://ghcr-badge.egpl.dev/niekcandaele/verta-ml-service/latest_tag?label=ml-service)](https://github.com/niekcandaele/Verta/pkgs/container/verta-ml-service)

A comprehensive Discord archive system with AI-powered question clustering and FAQ management.

## Features

- **Discord Sync**: Automated synchronization of Discord channels and messages
- **Question Clustering**: AI-powered clustering of similar questions using embeddings
- **Admin Interface**: Protected admin panel for managing question clusters and golden answers
- **Public FAQ**: Auto-generated FAQ section from golden answers
- **Static Export**: Generate static HTML archives for long-term preservation

## Tech Stack

### Backend
- **Node.js** with TypeScript
- **Express.js** for API server
- **TiDB** for vector database with embeddings
- **Kysely** for type-safe database queries
- **BullMQ** for job queue management
- **Redis** for caching
- **Docker** for containerization

### Frontend
- **Next.js 15** with TypeScript
- **React 18** for UI components
- **Tailwind CSS** with DaisyUI for styling
- **React Markdown** for markdown rendering

### ML Service
- **Python** with FastAPI
- **Sentence Transformers** for embeddings
- **scikit-learn** for clustering

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 20+
- Python 3.10+

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/verta.git
cd verta
```

2. Start services with Docker:
```bash
docker compose up -d
```

3. Run database migrations:
```bash
npm run migrate:latest
```

4. Start development servers:
```bash
npm run dev
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:25000
- ML Service: http://localhost:8000

## Admin Interface

### Accessing Admin Panel

Navigate to `/admin` and authenticate with:
- Username: `admin`
- Password: Value of `ADMIN_API_KEY` environment variable (default: `ikbeneenaap`)

### Managing Golden Answers

1. Go to Admin Panel → Question Clusters
2. Click on a cluster to view details
3. Add or edit the golden answer using markdown
4. Save changes - the answer will appear in the public FAQ

### Admin API Endpoints

All admin endpoints require `X-API-KEY` header:

```bash
# Get clusters
curl -H "X-API-KEY: ikbeneenaap" http://localhost:25000/api/admin/clusters

# Get cluster details
curl -H "X-API-KEY: ikbeneenaap" http://localhost:25000/api/admin/clusters/{id}

# Create/update golden answer
curl -X POST -H "X-API-KEY: ikbeneenaap" \
  -H "Content-Type: application/json" \
  -d '{"answer": "Answer text", "answer_format": "markdown"}' \
  http://localhost:25000/api/admin/clusters/{id}/golden-answer

# Delete golden answer
curl -X DELETE -H "X-API-KEY: ikbeneenaap" \
  http://localhost:25000/api/admin/clusters/{id}/golden-answer
```

## Public FAQ

The FAQ is automatically generated from clusters with golden answers:

- **Endpoint**: GET `/api/v1/faq`
- **Cached Endpoint**: GET `/api/v1/faq/cached` (5-minute TTL)
- **Frontend Page**: `/faq`

Query parameters:
- `tenant_id`: Filter by tenant
- `limit`: Maximum items to return (default: 50, max: 100)

## Discord Synchronization

### Manual Sync Trigger

```bash
# Sync all tenants
npm run discord:sync

# Sync specific tenant
npm run discord:sync -- --tenant=takaro
```

### API Sync Trigger

```bash
curl -X POST -H "X-API-KEY: ikbeneenaap" \
  http://localhost:25000/api/sync
```

## Development

### Project Structure

```
verta/
├── backend/           # Express.js API server
│   ├── src/
│   │   ├── routes/    # API endpoints
│   │   ├── repositories/ # Database access layer
│   │   ├── services/  # Business logic
│   │   └── workers/   # Background jobs
├── frontend/          # Next.js application
│   ├── pages/         # Page components
│   ├── components/    # Reusable components
│   └── lib/           # Utilities and API clients
├── ml-service/        # Python ML service
│   └── src/           # ML models and API
└── docker-compose.yml # Service orchestration
```

### Running Tests

```bash
# Backend tests
cd backend && npm test

# Run specific test file
npx vitest run src/routes/api/admin/__tests__/clusters.integration.test.ts

# Watch mode
npm run test:watch
```

### Database Migrations

```bash
# Create new migration
npm run migrate:make -- migration_name

# Run migrations
npm run migrate:latest

# Rollback
npm run migrate:down
```

### Environment Variables

Create `.env` file in backend directory:

```env
# Database
DATABASE_URL=mysql://user:password@localhost:4000/verta

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Admin
ADMIN_API_KEY=your-secret-key

# Discord
DISCORD_BOT_TOKEN=your-bot-token

# ML Service
ML_SERVICE_URL=http://localhost:8000
```

## Security Features

- **Markdown Sanitization**: All user-generated markdown is sanitized
- **Basic Auth**: Admin interface protected with HTTP Basic Authentication
- **API Key Protection**: Backend admin endpoints require API key
- **XSS Prevention**: React automatically escapes content
- **SQL Injection Protection**: Kysely provides parameterized queries

## Performance Optimizations

- **Redis Caching**: FAQ responses cached for 5 minutes
- **Database Indexes**: Optimized queries with proper indexing
- **Static Generation**: FAQ pages pre-rendered at build time
- **Retry Logic**: API client includes exponential backoff
- **Connection Pooling**: Efficient database connection management

## Troubleshooting

### Common Issues

1. **CORS Errors**: Admin API uses Next.js proxy to avoid CORS
2. **Database Connection**: Ensure TiDB is running on port 4000
3. **Redis Connection**: Check Redis is running on port 6379
4. **Authentication**: Verify ADMIN_API_KEY matches in frontend and backend

### Debug Commands

```bash
# Check service status
docker compose ps

# View logs
docker logs verta-app -f

# Database console
docker exec -it tidb mysql -u root -P 4000

# Redis CLI
docker exec -it verta-redis redis-cli
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests
5. Submit a pull request

## License

MIT

## Support

For issues and questions, please use the GitHub issue tracker.