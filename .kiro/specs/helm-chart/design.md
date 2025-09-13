# Technical Design

## Architecture Overview

The Helm chart provides a complete Kubernetes deployment solution for Verta's multi-service architecture. It packages the backend API, frontend Next.js application, ML service, and Redis cache into a cohesive deployment with proper networking, configuration, and scaling capabilities.

```
┌─────────────────┐     ┌──────────────────┐
│    Ingress      │────▶│  Frontend Pod(s)  │
│  (nginx/alb)    │     └──────────────────┘
└─────────────────┘              │
         │                       ▼
         │              ┌──────────────────┐     ┌─────────────┐
         └─────────────▶│  Backend Pod(s)  │────▶│    Redis    │
                        └──────────────────┘     └─────────────┘
                                 │
                                 ▼
                        ┌──────────────────┐     ┌─────────────┐
                        │   ML Pod(s)      │     │  TiDB Cloud │
                        └──────────────────┘     │  (External) │
                                 │               └─────────────┘
                                 └──────────────────────┘
```

## Chart Structure

### Chart.yaml
```yaml
apiVersion: v2
name: verta
description: Helm chart for Verta - Tenant Static Archive System
type: application
version: 1.0.0
appVersion: "1.0.0"
keywords:
  - verta
  - discord
  - archive
  - search
home: https://github.com/niekcandaele/Verta
sources:
  - https://github.com/niekcandaele/Verta
maintainers:
  - name: Verta Team
    email: team@verta.app
dependencies:
  - name: redis
    version: "17.x.x"
    repository: https://charts.bitnami.com/bitnami
    condition: redis.enabled
```

### Values Structure

The values.yaml provides a hierarchical configuration:

```yaml
global:
  domain: verta.example.com
  imageRegistry: ghcr.io
  imagePullSecrets: []

backend:
  image:
    repository: ghcr.io/niekcandaele/verta-backend
    tag: latest
    pullPolicy: IfNotPresent
  replicas: 2
  resources:
    requests:
      cpu: 100m
      memory: 256Mi
    limits:
      cpu: 500m
      memory: 512Mi
  env:
    NODE_ENV: production
    PORT: "25000"

frontend:
  image:
    repository: ghcr.io/niekcandaele/verta-frontend
    tag: latest
  replicas: 2
  resources:
    requests:
      cpu: 50m
      memory: 128Mi
    limits:
      cpu: 200m
      memory: 256Mi

ml:
  image:
    repository: ghcr.io/niekcandaele/verta-ml
    tag: latest
  replicas: 1
  resources:
    requests:
      cpu: 500m
      memory: 1Gi
    limits:
      cpu: 2000m
      memory: 2Gi

redis:
  enabled: true
  architecture: standalone
  auth:
    enabled: true
    password: ""  # Generated if not set
  persistence:
    enabled: true
    size: 8Gi

secrets:
  databaseUrl: ""
  discordToken: ""
  adminApiKey: ""
  sentryDsn: ""
```

## Kubernetes Resources

### Deployments

Each service has its own deployment with specific configurations:

#### Backend Deployment
- Init container for database migrations
- Environment variables from ConfigMap and Secrets
- Health checks on /health endpoint
- Volume mounts for temporary files

#### Frontend Deployment
- Next.js specific environment variables
- Static asset caching configuration
- Readiness probe on homepage

#### ML Service Deployment
- Higher resource allocations for model inference
- Pre-warmed model cache
- Liveness probe on /ml/health

### Services

Internal communication uses ClusterIP services:
- `verta-backend`: Port 25000
- `verta-frontend`: Port 3000
- `verta-ml`: Port 8000
- `verta-redis`: Port 6379

### Ingress Configuration

Path-based routing with TLS support:
```yaml
rules:
  - host: {{ .Values.global.domain }}
    http:
      paths:
        - path: /api
          pathType: Prefix
          backend:
            service:
              name: verta-backend
              port:
                number: 25000
        - path: /
          pathType: Prefix
          backend:
            service:
              name: verta-frontend
              port:
                number: 3000
```

### ConfigMaps and Secrets

#### ConfigMap
Non-sensitive configuration shared across services:
- ML model parameters
- Feature flags
- Service URLs
- Queue configurations

#### Secrets
Sensitive data encoded and mounted as environment variables:
- Database connection strings
- API keys
- Authentication tokens
- Encryption keys

### Horizontal Pod Autoscaling

Each service has independent HPA configuration:
```yaml
metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### Pod Disruption Budgets

Ensures availability during updates:
- Backend: minAvailable: 1
- Frontend: minAvailable: 1
- ML: minAvailable: 0 (single instance)

## Security Configurations

### Pod Security Context
```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  fsGroup: 1000
  capabilities:
    drop:
      - ALL
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
```

### Network Policies
Optional network policies restrict traffic:
- Backend can only be accessed by frontend and ingress
- ML service only accessible from backend
- Redis only accessible from backend

## Environment-Specific Configurations

### Development (values-dev.yaml)
- Minimal replicas (1 each)
- Lower resource limits
- Debug logging enabled
- No persistence for Redis

### Production (values-prod.yaml)
- Multiple replicas with anti-affinity
- Higher resource allocations
- Persistence enabled
- Monitoring annotations

## Deployment Patterns

### Rolling Updates
- maxSurge: 1
- maxUnavailable: 0
- Ensures zero-downtime deployments

### Init Containers
Database migration pattern:
```yaml
initContainers:
  - name: migrate
    image: {{ .Values.backend.image.repository }}:{{ .Values.backend.image.tag }}
    command: ["npm", "run", "migrate:deploy"]
    env:
      - name: DATABASE_URL
        valueFrom:
          secretKeyRef:
            name: verta
            key: database-url
```

### Health Checks
Configured probes for each service:
- **Liveness**: Restart if unhealthy
- **Readiness**: Remove from service if not ready
- **Startup**: Allow time for initialization

## Integration Points

### CI/CD Pipeline
- GitHub Actions build and push Docker images
- Helm chart versioning follows semantic versioning
- Automated testing before release
- Chart publishing to repository

### Monitoring
- Prometheus annotations for metrics scraping
- Standardized labels for service discovery
- Log aggregation through stdout/stderr

### Backup and Recovery
- Redis persistence to PVC
- Database handled by external TiDB
- Application state in external storage

## Testing and Validation

### Helm Lint
Validates chart syntax and best practices

### Dry Run Testing
```bash
helm install verta ./charts/verta --dry-run --debug
```

### Integration Testing
Deploy to test cluster and verify:
- All pods become ready
- Services communicate correctly
- Ingress routes traffic properly
- Scaling works under load

## Troubleshooting Guide

Common issues and solutions:
- **Pods not starting**: Check secrets and ConfigMaps
- **Migration failures**: Verify database connectivity
- **OOM kills**: Adjust resource limits
- **Slow performance**: Check HPA metrics
- **Network issues**: Verify service names and ports