# CI/CD Pipeline Documentation

## Overview

The Verta monorepo uses GitHub Actions for continuous integration and delivery. Our pipeline automatically builds, tests, and publishes Docker images for all services.

## Pipeline Architecture

### Workflow Files
- `.github/workflows/ci.yml` - Main CI pipeline
- `.github/workflows/docker-build-push.yml` - Reusable Docker build workflow

### Pipeline Stages
1. **Quality Checks** - Runs on every push and PR
   - Install dependencies for all workspaces
   - Build all TypeScript packages
   - Lint backend and frontend code
   - Run backend tests

2. **Docker Builds** - Runs after quality checks pass
   - Builds optimized production images
   - Pushes to GitHub Container Registry (ghcr.io)
   - Tags images based on branch/PR/version

## Docker Images

Our images are publicly available at:
- `ghcr.io/niekcandaele/verta-backend`
- `ghcr.io/niekcandaele/verta-frontend`
- `ghcr.io/niekcandaele/verta-ml-service`

### Image Tags
- `latest` - Latest from main branch
- `pr-<number>` - Pull request builds
- `<branch-name>` - Branch builds (sanitized)
- `v<version>` - Semantic version tags
- Custom tags via manual dispatch

### Pulling Images
```bash
# Latest stable version
docker pull ghcr.io/niekcandaele/verta-backend:latest

# Specific PR version
docker pull ghcr.io/niekcandaele/verta-backend:pr-7

# Specific version
docker pull ghcr.io/niekcandaele/verta-backend:v1.0.0
```

## Manual Workflows

### Triggering Manual Builds

You can manually trigger builds via GitHub UI:

1. Go to Actions → CI Pipeline
2. Click "Run workflow"
3. Configure options:
   - **Push images**: Whether to push to registry (default: true)
   - **Custom tag**: Additional tag for images (optional)

### Example: Building without Push
Useful for testing changes without publishing:
- Set "Push images" to false
- Run the workflow
- Check build logs for errors

## Performance Optimizations

- **Concurrency Control**: Redundant runs are automatically cancelled
- **Layer Caching**: Docker layers cached in GitHub Actions and registry
- **Parallel Builds**: All services build simultaneously
- **Smart Dependencies**: Shared-types builds once, reused by others

## Troubleshooting

### Build Failures
1. Check the GitHub Actions logs
2. Look for lint errors first (most common)
3. Verify all dependencies are installed
4. Check Docker build output for missing files

### Slow Builds
- First runs are slower (no cache)
- Subsequent builds use cached layers
- Target: <15 minutes total pipeline time

### Image Pull Issues
- Images are public, no authentication needed
- Verify the tag exists in the packages page
- Check for typos in image names

## Development Tips

### Local Testing
Before pushing, run locally:
```bash
# Lint check
npm run lint --workspaces

# Build check  
npm run build --workspaces

# Docker build test
docker build -f backend/Dockerfile .
```

### PR Workflow
1. Create feature branch
2. Push changes - CI runs automatically
3. Fix any failures before requesting review
4. PR images available at `pr-<number>` tag

## Security

- Images are scanned by GitHub
- No secrets in images (build args only)
- GITHUB_TOKEN has minimal permissions
- Public images contain no sensitive data