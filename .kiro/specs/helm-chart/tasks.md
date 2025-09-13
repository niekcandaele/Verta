# Implementation Tasks: Helm Chart for Verta Application

## Overview
We're building a production-ready Helm chart for the Verta application to enable Kubernetes deployments. The implementation follows a phased approach, starting with a minimal skeleton and progressively adding features until we have a complete, production-ready chart with monitoring, scaling, and multi-environment support.

**Total Phases**: 5 phases to incrementally build from basic structure to production-ready deployment

## Phase 1: Minimal Chart Skeleton
**Goal**: Create a basic Helm chart structure that can be installed (even if it doesn't deploy the app yet)
**Demo**: "At standup, I can show: `helm install verta ./charts/verta --dry-run` succeeds with valid YAML output"

### Tasks
- [ ] Task 1.1: Initialize Helm chart structure
  - **Output**: Basic chart directory with required files
  - **Files**: 
    - `/charts/verta/Chart.yaml`
    - `/charts/verta/values.yaml` 
    - `/charts/verta/templates/_helpers.tpl`
    - `/charts/verta/.helmignore`
  - **Verify**: Run `helm create verta` in `/charts` directory

- [ ] Task 1.2: Configure Chart.yaml with metadata
  - **Depends on**: 1.1
  - **Output**: Properly configured chart metadata
  - **Files**: `/charts/verta/Chart.yaml`
  - **Changes**:
    - Set description to "Helm chart for Verta - Tenant Static Archive System"
    - Add keywords, home, sources, maintainers
    - Add Redis dependency from Bitnami
  - **Verify**: `helm dependency update` downloads Redis chart

- [ ] Task 1.3: Create minimal values.yaml structure
  - **Depends on**: 1.2
  - **Output**: Basic values structure for all services
  - **Files**: `/charts/verta/values.yaml`
  - **Content**: Global settings, service stubs (backend, frontend, ml, redis)
  - **Verify**: `helm template verta ./charts/verta` runs without errors

### Phase 1 Checkpoint
- [ ] Run lint: `helm lint ./charts/verta`
- [ ] Run template: `helm template verta ./charts/verta`
- [ ] Run install dry-run: `helm install verta ./charts/verta --dry-run --debug`
- [ ] Manual verification: Chart structure follows Helm best practices
- [ ] **Demo ready**: Show valid Helm chart that passes all validation

## Phase 2: Core Service Deployments
**Goal**: Deploy the three main application services (backend, frontend, ML) as basic pods
**Demo**: "At standup, I can show: kubectl get pods shows all three services running"

### Tasks
- [ ] Task 2.1: Create backend deployment template
  - **Output**: Backend pods can be deployed
  - **Files**: `/charts/verta/templates/backend-deployment.yaml`
  - **Features**: 
    - Basic deployment with configurable replicas
    - Container from ghcr.io/niekcandaele/verta-backend
    - Environment variables from values
    - Health checks (liveness/readiness)
  - **Verify**: `kubectl get deployment verta-backend` shows ready replicas

- [ ] Task 2.2: Create frontend deployment template
  - **Depends on**: 2.1
  - **Output**: Frontend pods can be deployed
  - **Files**: `/charts/verta/templates/frontend-deployment.yaml`
  - **Features**: Similar structure to backend, Next.js specific config
  - **Remove**: Generic deployment.yaml from helm create
  - **Verify**: `kubectl get deployment verta-frontend` shows ready replicas

- [ ] Task 2.3: Create ML service deployment template
  - **Depends on**: 2.2
  - **Output**: ML service pods can be deployed
  - **Files**: `/charts/verta/templates/ml-deployment.yaml`
  - **Features**: Higher resource limits, Python-specific config
  - **Verify**: `kubectl get deployment verta-ml` shows ready replicas

- [ ] Task 2.4: Update values.yaml with service configurations
  - **Depends on**: 2.3
  - **Output**: All service configurations in values
  - **Files**: `/charts/verta/values.yaml`
  - **Content**: Image repos, tags, resources, env vars for each service
  - **Verify**: `helm upgrade verta ./charts/verta` applies changes

### Phase 2 Checkpoint
- [ ] Run lint: `helm lint ./charts/verta`
- [ ] Deploy to cluster: `helm install verta ./charts/verta --set secrets.adminApiKey=test`
- [ ] Check pods: `kubectl get pods -l app.kubernetes.io/instance=verta`
- [ ] Previous functionality still works: Chart structure remains valid
- [ ] **Demo ready**: Three service pods running in Kubernetes

## Phase 3: Networking & Configuration
**Goal**: Enable service communication, external access, and proper configuration management
**Demo**: "At standup, I can show: Services can communicate internally and frontend is accessible via ingress"

### Tasks
- [ ] Task 3.1: Create Kubernetes services for each deployment
  - **Output**: Services enable pod-to-pod communication
  - **Files**: 
    - `/charts/verta/templates/backend-service.yaml`
    - `/charts/verta/templates/frontend-service.yaml`
    - `/charts/verta/templates/ml-service.yaml`
  - **Remove**: Generic service.yaml from helm create
  - **Verify**: `kubectl get svc` shows all services with correct ports

- [ ] Task 3.2: Create ConfigMap for non-sensitive configuration
  - **Depends on**: 3.1
  - **Output**: Shared configuration across services
  - **Files**: `/charts/verta/templates/configmap.yaml`
  - **Content**: ML service settings, feature flags, thresholds
  - **Verify**: `kubectl get configmap verta` shows data

- [ ] Task 3.3: Create Secret template for sensitive data
  - **Depends on**: 3.2
  - **Output**: Secrets properly encoded and mounted
  - **Files**: `/charts/verta/templates/secret.yaml`
  - **Content**: API keys, database URL, Discord token
  - **Verify**: `kubectl get secret verta` exists (don't decode in demo)

- [ ] Task 3.4: Create Ingress for external access
  - **Depends on**: 3.3
  - **Output**: Frontend and API accessible externally
  - **Files**: `/charts/verta/templates/ingress.yaml`
  - **Remove**: Generic ingress.yaml from helm create
  - **Features**: Path-based routing to frontend/backend
  - **Verify**: `kubectl get ingress verta` shows configured paths

- [ ] Task 3.5: Add init container for database migrations
  - **Depends on**: 3.4
  - **Output**: Migrations run before backend starts
  - **Files**: Update `/charts/verta/templates/backend-deployment.yaml`
  - **Features**: Init container with migration command
  - **Verify**: `kubectl describe pod` shows init container completed

### Phase 3 Checkpoint
- [ ] Run lint: `helm lint ./charts/verta`
- [ ] Upgrade deployment: `helm upgrade verta ./charts/verta`
- [ ] Test internal DNS: Exec into pod and ping services
- [ ] Test ingress: Access frontend URL in browser
- [ ] **Demo ready**: Full service communication and external access working

## Phase 4: Production Features
**Goal**: Add production-ready features like autoscaling, pod disruption budgets, and security
**Demo**: "At standup, I can show: HPA scaling pods based on load and security contexts enforced"

### Tasks
- [ ] Task 4.1: Add Horizontal Pod Autoscalers
  - **Output**: Services scale based on CPU/memory
  - **Files**: 
    - `/charts/verta/templates/backend-hpa.yaml`
    - `/charts/verta/templates/frontend-hpa.yaml`
  - **Remove**: Generic hpa.yaml from helm create
  - **Verify**: `kubectl get hpa` shows metrics and scaling

- [ ] Task 4.2: Add Pod Disruption Budgets
  - **Depends on**: 4.1
  - **Output**: Maintain availability during updates
  - **Files**: `/charts/verta/templates/poddisruptionbudget.yaml`
  - **Verify**: `kubectl get pdb` shows minimum available pods

- [ ] Task 4.3: Add security contexts and pod security
  - **Depends on**: 4.2
  - **Output**: Pods run as non-root with restricted permissions
  - **Files**: Update all deployment templates
  - **Features**: runAsNonRoot, readOnlyRootFilesystem, allowPrivilegeEscalation: false
  - **Verify**: `kubectl describe pod` shows security contexts

- [ ] Task 4.4: Update NOTES.txt with helpful information
  - **Depends on**: 4.3
  - **Output**: Post-install instructions for users
  - **Files**: `/charts/verta/templates/NOTES.txt`
  - **Content**: How to access app, view logs, check status
  - **Remove**: Generic content from helm create
  - **Verify**: `helm install` shows custom notes

- [ ] Task 4.5: Add Redis subchart configuration
  - **Depends on**: 4.4
  - **Output**: Redis properly configured with persistence
  - **Files**: `/charts/verta/values.yaml` (redis section)
  - **Verify**: `kubectl get pod verta-redis-master-0` shows running

### Phase 4 Checkpoint
- [ ] Run lint: `helm lint ./charts/verta`
- [ ] Test scaling: Generate load and watch HPA scale pods
- [ ] Test PDB: Try to drain node and verify minimum pods maintained
- [ ] Security scan: Run `kubectl describe pod` and verify contexts
- [ ] **Demo ready**: Production features protecting and scaling the application

## Phase 5: Documentation & Multi-Environment Support
**Goal**: Complete documentation and environment-specific configurations
**Demo**: "At standup, I can show: Easy deployment to dev/prod with different configurations"

### Tasks
- [ ] Task 5.1: Create environment-specific values files
  - **Output**: Optimized configurations per environment
  - **Files**: 
    - `/charts/verta/values-dev.yaml` (minimal resources)
    - `/charts/verta/values-prod.yaml` (HA configuration)
  - **Verify**: `helm install verta ./charts/verta -f values-dev.yaml --dry-run`

- [ ] Task 5.2: Create comprehensive README
  - **Depends on**: 5.1
  - **Output**: Complete installation and operation guide
  - **Files**: `/charts/verta/README.md`
  - **Content**: Prerequisites, installation, configuration, troubleshooting
  - **Verify**: Follow README to deploy from scratch

- [ ] Task 5.3: Create test script for local validation
  - **Depends on**: 5.2
  - **Output**: Automated testing of chart installation
  - **Files**: `/scripts/helm-test.sh`
  - **Features**: Lint, dry-run, optional real install
  - **Verify**: `./scripts/helm-test.sh` completes successfully

- [ ] Task 5.4: Create CI/CD workflow for chart releases
  - **Depends on**: 5.3
  - **Output**: Automated chart testing and publishing
  - **Files**: `/.github/workflows/helm-release.yml`
  - **Features**: Lint, test, package, publish to chart repository
  - **Verify**: GitHub Actions workflow passes

- [ ] Task 5.5: Update .helmignore and finalize structure
  - **Depends on**: 5.4
  - **Output**: Clean chart package without unnecessary files
  - **Files**: `/charts/verta/.helmignore`
  - **Content**: Exclude test files, env-specific values from package
  - **Verify**: `helm package ./charts/verta` creates clean archive

### Phase 5 Checkpoint
- [ ] Run lint: `helm lint ./charts/verta`
- [ ] Package chart: `helm package ./charts/verta`
- [ ] Test dev install: `helm install verta-dev ./charts/verta -f values-dev.yaml`
- [ ] Test prod install: `helm install verta-prod ./charts/verta -f values-prod.yaml`
- [ ] **Demo ready**: Complete Helm chart with multi-environment support

## Final Verification
- [ ] All requirements from design doc met:
  - [ ] REQ-001: All three services deployed
  - [ ] REQ-002: Services communicate via K8s DNS
  - [ ] REQ-003: Multiple environments supported
  - [ ] REQ-004: Secrets managed separately
  - [ ] REQ-005: Horizontal scaling enabled
  - [ ] REQ-006: Database migrations run as init containers
- [ ] All obsolete code removed (generic templates from helm create)
- [ ] Tests comprehensive (lint, dry-run, actual deployment)
- [ ] Documentation updated (README, NOTES.txt, inline comments)
- [ ] Chart follows Helm best practices
- [ ] Zero-downtime upgrades verified
- [ ] Integration with CI/CD pipeline ready