# Design: CI/CD Pipeline for Verta Monorepo

## Layer 1: Problem & Requirements

### Problem Statement
The Verta project currently lacks automated CI/CD processes, requiring manual builds, testing, and deployment. This creates risks of deploying broken code, inconsistent container images, and increases the time and effort required for releases. We need an automated pipeline that validates code quality, runs tests, and builds/publishes Docker containers for all services.

### Current State
Currently:
- Manual execution of `npm run build`, `npm run lint`, and `npm run test` for each workspace
- Docker images are built locally using `docker compose` 
- No automated container registry publishing
- No automated quality gates for PRs
- Manual deployment process with potential for human error
- Three separate services (backend, frontend, python-ml-service) requiring coordination

### Requirements
#### Functional
- REQ-001: The system SHALL run builds for all workspaces (backend, frontend, shared-types) on every push
- REQ-002: The system SHALL execute linting (ESLint for JS/TS, Next.js lint for frontend) on all code changes
- REQ-003: The system SHALL run test suites (Vitest for backend) when tests exist
- REQ-004: The system SHALL build Docker images for all three services (backend, frontend, python-ml-service)
- REQ-005: The system SHALL push Docker images to GitHub Container Registry (ghcr.io) under the user namespace as public images
- REQ-006: WHEN code is pushed to a branch THEN images SHALL be tagged with branch name
- REQ-007: WHEN a PR is created THEN images SHALL be tagged with pr-<number>
- REQ-008: WHEN a git tag is pushed THEN images SHALL be tagged with the version tag
- REQ-009: The system SHALL fail the pipeline if any quality check fails

#### Non-Functional
- Performance: Pipeline should complete within 15 minutes for typical changes
- Security: Container registry credentials must be securely managed
- Image Visibility: Docker images will be publicly accessible
- Usability: Clear feedback on pipeline status and failure reasons
- Reliability: Pipeline should be idempotent and reproducible

### Constraints
- Must use GitHub Actions (implied by GitHub Container Registry requirement)
- Must support Node.js 20+ and 24 (per package.json engine requirements)
- Must handle monorepo structure with npm workspaces
- Must support multi-stage Docker builds
- Python service requires model downloads during build
- Docker images should be built for amd64 architecture only
- No test coverage requirements will be enforced

### Success Criteria
- Automated quality checks prevent merging of failing code
- Container images are automatically available for all branches/PRs/tags
- Deployment process can pull pre-built images instead of building locally
- Pipeline failures provide clear actionable feedback
- Images are accessible without authentication (public)
- Manual deployment process remains unchanged

## Layer 2: Functional Specification

### User Workflows
1. **Developer Push Workflow**
   - Developer pushes code to branch → GitHub Actions triggered → Build/lint/test executed → Docker images built → Images pushed with branch tag → Developer notified of status

2. **Pull Request Workflow**
   - Developer creates PR → CI runs all checks → PR blocked if checks fail → Docker images built with pr-N tag → Review team can test using PR images → Merge allowed after passing

3. **Release Workflow**
   - Maintainer creates git tag → CI triggered → Full validation suite runs → Production Docker images built → Images pushed with version tag → Ready for deployment

### External Interfaces
- GitHub Container Registry API for image publishing (ghcr.io/username/verta-*)
- GitHub Actions status checks for PR integration
- Docker Hub for base image pulls
- npm registry for dependency installation

> **Decision**: Container Registry Configuration
> **Rationale**: Images will be published as public containers under the user's namespace to simplify access
> **Alternative**: Private images with access tokens (not chosen - adds complexity)

### Alternatives Considered
| Option | Pros | Cons | Why Not Chosen |
|--------|------|------|----------------|
| GitLab CI | Integrated registry, good Docker support | Would require migration from GitHub | Project already on GitHub |
| CircleCI | Powerful caching, fast builds | Additional service to manage, cost | GitHub Actions is integrated and free for public repos |
| Jenkins | Highly customizable, self-hosted option | Complex setup, maintenance overhead | Overkill for current needs |
| Manual scripts | Full control, simple | No integration with PRs, error-prone | Defeats purpose of automation |

## Layer 3: Technical Specification

### Architecture
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

### Code Change Analysis
| Component | Action | Justification |
|-----------|--------|---------------|
| .github/workflows/ci.yml | Create | Main CI workflow definition |
| .github/workflows/build-push.yml | Create | Reusable workflow for Docker builds |
| package.json scripts | Extend | Add CI-specific scripts if needed |
| .dockerignore | Extend | Ensure CI artifacts excluded |

### Code to Remove
None - this is a new addition that doesn't replace existing functionality.

### Implementation Approach

#### Components
- **.github/workflows/ci.yml** (new file)
  - Main workflow triggered on push, PR, and tags
  - Orchestrates quality checks and Docker builds
  - Matrix strategy for parallel execution
  - Example logic (pseudocode):
    ```
    on push/pr/tag:
      if not draft PR:
        run quality-checks job
        if quality-checks pass:
          run docker-build job for each service
          push images with appropriate tags
    ```

- **.github/workflows/docker-build-push.yml** (new file)
  - Reusable workflow for Docker operations
  - Handles authentication to ghcr.io
  - Implements tagging strategy
  - Caches layers for performance
  - Builds for amd64 platform only
  - Includes model downloads in ML service build

> **Decision**: ML Model Build Strategy
> **Rationale**: Models are included in the Docker image build process to ensure consistency
> **Alternative**: Runtime model downloads (not chosen - adds deployment complexity)

- **GitHub Actions Secrets** (repository settings)
  - No code changes, but requires configuration
  - GITHUB_TOKEN automatically provided
  - May need additional secrets for specific services

#### Data Models
No database schema changes required.

#### Security
- Use GitHub's built-in GITHUB_TOKEN for ghcr.io authentication
- Implement least-privilege access for workflows
- Scan images for vulnerabilities using GitHub's built-in scanning
- Never commit sensitive data to repository

### Testing Strategy
- Unit tests: Run existing test suites (Vitest for backend) without coverage requirements
- Integration tests: Validate Docker images can start successfully
- E2E tests: Not in scope for initial implementation
- Pipeline tests: Use workflow_dispatch for manual testing

> **Decision**: Test Coverage Policy
> **Rationale**: No coverage thresholds will be enforced to enable rapid iteration
> **Alternative**: Minimum coverage requirements (not chosen - would slow initial implementation)

### Rollout Plan
1. **Phase 1**: Implement quality checks workflow (build, lint, test)
   - Test on feature branch
   - Validate all workspaces build correctly
   
2. **Phase 2**: Add Docker build without push
   - Ensure all images build successfully
   - Validate build caching works
   - Confirm ML models are included in build
   
3. **Phase 3**: Enable ghcr.io push for branches
   - Configure repository permissions for public access
   - Test image accessibility without authentication
   
4. **Phase 4**: Add PR and tag workflows
   - Implement conditional tagging logic
   - Test full workflow on sample PR
   
5. **Phase 5**: Enable as required checks
   - Configure branch protection rules
   - Document for team
   - Deployment remains manual process

> **Decision**: Deployment Automation
> **Rationale**: CI/CD will only build and publish images; deployment stays manual for safety
> **Alternative**: Auto-deployment workflows (not chosen - requires careful production safeguards)