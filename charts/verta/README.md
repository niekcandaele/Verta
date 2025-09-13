# Verta Helm Chart

This Helm chart deploys Verta - Tenant Static Archive System on a Kubernetes cluster.

## Prerequisites

- Kubernetes 1.25+
- Helm 3.0+
- PV provisioner support in the underlying infrastructure (for Redis persistence)
- TiDB Cloud database (external)

## Installing the Chart

To install the chart with the release name `verta`:

```bash
helm install verta . \
  --set secrets.adminApiKey="your-admin-key" \
  --set secrets.databaseUrl="mysql://user:pass@tidb-host:4000/database" \
  --set secrets.discordBotToken="your-discord-token" \
  --set secrets.openrouterApiKey="your-openrouter-key" \
  --set global.domain="verta.example.com"
```

## Upgrading the Chart

```bash
helm upgrade verta . \
  --reuse-values \
  --set image.tag="new-version"
```

## Uninstalling the Chart

```bash
helm uninstall verta
```

This command removes all the Kubernetes components associated with the chart and deletes the release.

## Configuration

### Required Values

The following values **must** be provided during installation:

| Parameter | Description | Example |
|-----------|-------------|---------|
| `secrets.adminApiKey` | Admin API key for internal services | `your-secret-key` |
| `secrets.databaseUrl` | TiDB connection string | `mysql://user:pass@host:4000/db` |
| `secrets.discordBotToken` | Discord bot token | `your-bot-token` |
| `secrets.openrouterApiKey` | OpenRouter API key | `your-api-key` |

### Key Configuration Options

| Parameter | Description | Default |
|-----------|-------------|---------|
| `global.domain` | Base domain for the application | `verta.example.com` |
| `global.imageRegistry` | Container image registry | `ghcr.io` |
| `backend.replicaCount` | Number of backend replicas | `2` |
| `backend.resources` | CPU/Memory resource requests/limits | See values.yaml |
| `frontend.replicaCount` | Number of frontend replicas | `2` |
| `ml.replicaCount` | Number of ML service replicas | `1` |
| `redis.enabled` | Enable Redis subchart | `true` |
| `ingress.enabled` | Enable Ingress | `true` |
| `ingress.className` | Ingress class name | `nginx` |

For a complete list of configurable parameters, see the [values.yaml](values.yaml) file.

## Using Environment-Specific Values

### Development Environment

```bash
helm install verta . -f values-dev.yaml \
  --set secrets.adminApiKey="dev-key" \
  --set secrets.databaseUrl="mysql://dev@localhost:3306/verta_dev"
```

### Production Environment

```bash
helm install verta . -f values-prod.yaml \
  --set-file secrets.adminApiKey=/path/to/admin-key \
  --set-file secrets.databaseUrl=/path/to/db-url \
  --set global.domain="verta.production.com"
```

## Secrets Management

### Option 1: Direct Values (Development Only)

```bash
helm install verta . --set secrets.adminApiKey="key"
```

### Option 2: Values from Files

```bash
helm install verta . \
  --set-file secrets.adminApiKey=/secure/path/admin-key.txt \
  --set-file secrets.databaseUrl=/secure/path/db-url.txt
```

### Option 3: Pre-created Secrets

Create the secret manually:

```bash
kubectl create secret generic verta \
  --from-literal=admin-api-key="your-key" \
  --from-literal=database-url="mysql://..." \
  --from-literal=discord-bot-token="..."
```

Then install with existing secret (requires chart modification).

### Option 4: External Secrets Operator

Use External Secrets Operator to sync secrets from external systems like AWS Secrets Manager, HashiCorp Vault, etc.

## Accessing the Application

### With Ingress Enabled

If you've configured ingress with a domain:

```
https://verta.example.com
```

### Without Ingress (Port Forward)

```bash
kubectl port-forward svc/verta-frontend 3000:3000
```

Then access at `http://localhost:3000`

## Monitoring and Troubleshooting

### Check Deployment Status

```bash
kubectl get deployments -l app.kubernetes.io/instance=verta
kubectl get pods -l app.kubernetes.io/instance=verta
```

### View Logs

```bash
# Backend logs
kubectl logs -l app.kubernetes.io/instance=verta,app.kubernetes.io/component=backend

# Frontend logs
kubectl logs -l app.kubernetes.io/instance=verta,app.kubernetes.io/component=frontend

# ML service logs
kubectl logs -l app.kubernetes.io/instance=verta,app.kubernetes.io/component=ml
```

### Common Issues

1. **Pods in CrashLoopBackOff**: Check secrets are properly configured
2. **ML service OOMKilled**: Increase memory limits in values
3. **Database connection errors**: Verify DATABASE_URL and network connectivity
4. **Redis connection errors**: Check Redis pod status and service

## Development

### Testing the Chart

```bash
# Lint the chart
helm lint .

# Dry run installation
helm install verta . --dry-run --debug

# Test with local values
helm install verta . -f values-dev.yaml --dry-run
```

### Updating Dependencies

```bash
helm dependency update
```

## Architecture

The chart deploys:

- **Backend API** (Node.js): REST API service
- **Frontend** (Next.js): Web interface
- **ML Service** (Python): Machine learning processing
- **Redis**: Cache and queue management
- **Ingress**: External access routing

All services communicate internally via Kubernetes DNS.

## Security Considerations

- Secrets are base64 encoded in Kubernetes (not encrypted)
- Use external secret management in production
- Enable NetworkPolicies for pod-to-pod restrictions
- Run containers as non-root user (configured by default)
- Use TLS for ingress in production

## License

This Helm chart is part of the Verta project and follows the same license.