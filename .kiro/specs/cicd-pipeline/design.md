# CI/CD Pipeline Technical Design

## Architecture Overview

The CI/CD pipeline uses GitHub Actions to automate quality checks, Docker image building, and container registry publishing. The architecture follows a two-stage approach: quality validation followed by containerization.

```
GitHub Push/PR/Tag Event
        ↓
GitHub Actions Workflow
        ↓
    ┌───────────────────────┐
    │   Quality Checks       │
    │  - Install deps        │
    │  - Build workspaces    │
    │  - Run linters         │
    │  - Run tests           │
    └───────────────────────┘
        ↓ (if successful)
    ┌───────────────────────┐
    │   Container Build      │
    │  - Backend image       │
    │  - Frontend image      │
    │  - ML Service image    │
    │    (with models)       │
    └───────────────────────┘
        ↓
    ┌───────────────────────┐
    │   Container Push       │
    │  - Tag with context    │
    │  - Push to ghcr.io     │
    └───────────────────────┘
```

## Technical Decisions

### Container Registry Choice
**Decision:** Use GitHub Container Registry (ghcr.io)  
**Rationale:** Native integration with GitHub, free for public images, built-in permissions model  
**Alternative Considered:** Docker Hub - requires separate authentication and has rate limits

### Build Strategy
**Decision:** Separate quality checks from Docker builds  
**Rationale:** Fail fast on code issues before expensive Docker builds, clearer error reporting  
**Alternative Considered:** Single job doing everything - harder to debug failures

### Tagging Strategy
**Decision:** Context-based automatic tagging (branch, PR number, version)  
**Rationale:** Easy identification of image source, supports multiple deployment scenarios  
**Implementation:**
- Branch pushes → branch name tag
- Pull requests → pr-{number} tag  
- Version tags → semver tag + latest
- Manual dispatch → custom tag option

### Caching Strategy
**Decision:** Multi-layer caching with GitHub Actions cache and registry cache  
**Rationale:** Significantly reduces build times for incremental changes  
**Implementation:**
- GitHub Actions cache for build artifacts
- Docker layer caching via buildx
- Registry-based cache for remote builds

## Implementation Details

### Workflow Structure
Two workflow files provide separation of concerns:
- `ci.yml` - Main orchestration, triggers, and quality checks
- `docker-build-push.yml` - Reusable workflow for Docker operations

### Key Technical Features

#### Concurrency Control
```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```
Prevents redundant builds when multiple commits are pushed quickly.

#### Matrix Builds
Services are built in parallel using GitHub Actions matrix strategy:
```yaml
matrix:
  service:
    - name: backend
      dockerfile: ./backend/Dockerfile
    - name: frontend
      dockerfile: ./frontend/Dockerfile
    - name: ml-service
      dockerfile: ./python-ml-service/Dockerfile
```

#### Smart Tagging
The metadata-action automatically generates appropriate tags based on the trigger context:
```yaml
tags: |
  type=ref,event=branch
  type=ref,event=pr
  type=semver,pattern={{version}}
  type=raw,value=latest,enable={{is_default_branch}}
```

### Security Considerations

1. **Credentials:** GITHUB_TOKEN is automatically provided with minimal required permissions
2. **Image Scanning:** GitHub automatically scans pushed images for vulnerabilities
3. **Public Images:** No secrets or sensitive data in images
4. **Build Args:** Used only for build-time configuration, not runtime secrets

### Performance Optimizations

1. **BuildKit:** Modern Docker builder with improved caching
2. **Parallel Builds:** All three services build simultaneously
3. **Layer Caching:** Both local and remote cache sources
4. **Conditional Steps:** Skip unnecessary work (e.g., don't push on workflow_dispatch if disabled)

### Monorepo Handling

The pipeline understands the npm workspace structure:
- Builds shared-types first (dependency of others)
- Installs workspace dependencies correctly
- Handles workspace-specific commands (lint, test, build)

### Error Handling

- Each step has clear success/failure conditions
- Failures provide actionable error messages
- Build summaries show what was built and where it was pushed
- Non-critical failures (missing tests) don't block the pipeline

## Future Considerations

While not implemented in the current phase, the design supports:
- Multi-architecture builds (arm64)
- Deployment automation hooks
- Advanced caching strategies
- Security scanning integration
- Performance metrics collection