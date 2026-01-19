# Kubernetes Cluster Deployment Guide

This directory contains Kubernetes manifests for deploying Backstage and the Scaffolder Service to any Kubernetes cluster across different environments (development, test, staging, production).

> **🏗️ Namespace Architecture**: Uses multi-namespace setup with `backstage` namespace for platform services and `development` namespace for generated microservices. Includes cross-namespace RBAC for secure service deployment.

## Key Differences from Minikube

| Feature | Minikube | Kubernetes Cluster |
|---------|----------|-------------------|
| **Image Source** | Local (`minikube image load`) | Container Registry (Docker Hub, GCR, ECR) |
| **Service Type** | NodePort | ClusterIP + Ingress |
| **Replicas** | 1 | 2+ (High Availability) |
| **Storage** | emptyDir (ephemeral) | PersistentVolumeClaim |
| **Docker Socket** | Mounted (insecure) | ❌ Not mounted - use CI/CD |
| **Security** | Minimal | SecurityContext, NetworkPolicies |
| **TLS/HTTPS** | No | Yes (via Ingress) |
| **Monitoring** | kubectl logs | Prometheus, Grafana, Cloud Logging |
| **Environments** | Local dev only | Dev, test, stage, prod |
| **Namespace Isolation** | ✅ backstage + development | ✅ backstage + development |

## Prerequisites
- **Kubernetes cluster** (GKE, EKS, AKS, or self-managed)
2. **kubectl** configured to access your cluster
3. **Container Registry** access (Docker Hub, GCR, ECR, ACR)
4. **Domain name** for Ingress (for prod/staging environments)
5. **Ingress Controller** installed (nginx-ingress, or cloud provider)
6. **cert-manager** (optional, for automatic TLS certificates)
7. **GitHub Personal Access Token** with `repo` and `delete_repo` scopes

## Environment-Specific Configuration

## Configure GitHub owner (recommended)

The Scaffolder reads the `GITHUB_OWNER` value from a `ConfigMap` named `scaffolder-config` in the target namespace. This keeps credentials and configuration separate from the deployment manifests.

Create the ConfigMap in your namespace (example uses `backstage-prod`):

```bash
# From a literal value
kubectl create configmap scaffolder-config --from-literal=GITHUB_OWNER=your-github-username -n backstage-prod

# Or apply from a file (recommended for local edits):
# Copy template, edit and apply
cp ../../minikube/config.yaml.template config.yaml
# edit config.yaml and set GITHUB_OWNER
kubectl apply -f config.yaml -n backstage-prod
```

Also create the GitHub token secret (used by the deployment):

```bash
kubectl create secret generic github-token --from-literal=token=ghp_YourActualTokenHere -n backstage-prod
```

Then apply/update the Scaffolder deployment in the same namespace so it picks up the `ConfigMap` and secret:

```bash
kubectl apply -f scaffolder-deployment.yaml -n backstage-prod
kubectl rollout restart deployment/scaffolder-service -n backstage-prod
```


These manifests can be deployed to different environments by adjusting:

- **Namespace**: Create separate namespaces (`backstage-dev`, `backstage-test`, `backstage-stage`, `backstage-prod`)
- **Replicas**: 1 for dev/test, 2+ for staging/production
- **Resources**: Lower limits for dev/test, production-grade for prod
- **Ingress domains**: Different domains per environment
- **Storage size**: Smaller PVCs for dev/test

### Example: Creating Environment-Specific Namespaces

```bash
# Development
kubectl create namespace backstage-dev

# Test
kubectl create namespace backstage-test

# Staging
kubectl create namespace backstage-stage

# Production
kubectl create namespace backstage-prod
```
7. **GitHub Personal Access Token** with `repo` and `delete_repo` scopes

## Setup Steps

### 1. Build and Push Images to Container Registry

Choose your registry and update the image references in the deployment files.

**Docker Hub:**
```bash
# Login
docker login

# Build and push scaffolder service
cd scaffolder-service
docker build -t yourorg/scaffolder-service:v1.0.0 .
docker push yourorg/scaffolder-service:v1.0.0

# Build and push Backstage (if you have a custom build)
cd ../backstage/backstage-app
# Build your Backstage Docker image
docker build -t yourorg/backstage:v1.0.0 .
docker push yourorg/backstage:v1.0.0
```

**Google Container Registry (GCR):**
```bash
# Configure Docker for GCR
gcloud auth configure-docker

# Build and push
docker build -t gcr.io/YOUR_PROJECT_ID/scaffolder-service:v1.0.0 .
docker push gcr.io/YOUR_PR

Create a dedicated namespace for your environment:

```bash
# Choose your environment name (dev, test, stage, prod)
export ENV=prod
kubectl create namespace backstage-${ENV}
kubectl config set-context --current --namespace=backstage-${ENV}
```

Update the namespace in `scaffolder-deployment.yaml` ClusterRoleBinding:
```yaml
subjects:
- kind: ServiceAccount
  name: scaffolder-deployer
  namespace: backstage-prod  # Change to your namespace
Edit the deployment files and replace `YOUR_REGISTRY` with your actual registry:

```bash
# In production/scaffolder-deployment.yaml
# Change: image: YOUR_REGISTRY/scaffolder-service:latest
# To: image: do${ENV}.io/yourorg/scaffolder-service:v1.0.0

# In production/backstage-deployment.yaml
# Change: image: YOUR_REGISTRY/backstage:latest
# To: image: docker.io/yourorg/backstage:v1.0.0
```

### 3. Configure Namespace (Recommended)

Create a dedicated namespace for production:

```bash
kubectl create namespace backstage-prod
kubectl config ${ENV}context --current --namespace=backstage-prod
```

Update the namespace in `scaffolder-deployment.yaml` ClusterRoleBinding:
```yaml
subjects:
- kind: ServiceAccount
  name: scaffolder-deployer
  namespace: backstage-prod  # Change from 'default'
``` based on environment:
# Dev: backstage-dev.yourdomain.com
# Test: backstage-test.yourdomain.com
# Stage: backstage-stage.yourdomain.com
# Prod: backstage.yourdomain

```bash
kubectl create secret generic github-token \
  --from-literal=token=ghp_YourActualTokenHere \
  -n backstage-prod
```

### 5. (Optional) Create Registry${ENV}dentials

If using a private container registry:

```bash
kubectl create secret docker-registry registry-credentials \
  --docker-server=YOUR_REGISTRY_URL \
  --docker-username=YOUR_USERNAME \
  --docker-password=YOUR_PASSWORD \
  --docker-email=YOUR_EMAIL \
  -n backstage-prod
```

Then uncomment `imagePullSecrets` in the deployment files.

### 6. Configure DNS and Ingress

**Update ingress.yaml with your domain:**
```yaml
# Change these in ingress.yaml:
- backstage.yourdomain.com  → backstage.example.com
- api.backstage.yourdomain.com  → api.backstage.example.com
```

**Point DNS to your cluster:**
- **GKE**: Get Load Balancer IP from Ingress
- **EKS**: Get Load Balancer hostname from Ingress
- **AKS**: Get Load Balancer IP from Ingress

```bash
kubectl get ingress -n backstage-prod
```

Create DNS A/CNAME records pointing to the LoadBalancer IP/hostname.

### 7. Install Ingress Controller (if not installed)

**Nginx Ingress Controller:**
```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.1/deploy/static/provider/cloud/deploy.yaml
```
Kubernetes Cluster

```bash
# Apply in order:
kubectl apply -f persistent-volume-claim.yaml
kubectl apply -f scaffolder-deployment.yaml
kubectl apply -f backstage-deployment.yaml
kubectl apply -f ingress.yaml

# Check deployment status
kubectl get pods -n backstage-${ENV}
kubectl get svc -n backstage-${ENV}
kubectl get ingress -n backstage-${ENV}ypt:
```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:${ENV}

# Check logs
kubectl logs -l app=backstage -n backstage-${ENV}
kubectl logs -l app=scaffolder-service -n backstage-${ENV}

# Test endpoints (adjust domain for your environment)
        ingress:
          class: nginx
```

### 9. Deploy to Production

```bash
# Ase manifests do NOT mount `/var/run/docker.sock`. This is a critical security requirement for any non-local environ
kubectl apply -f persistent-volume-claim.yaml
kubectl apply -f scaffolder-deployment.yaml
kubectl apply -f backstage-deployment.yaml
kubectl apply -f ingress.yaml

# Check deployment status
kubectl get pods -n backstage-prod
kubectl get svc -n backstage-prod
kubectl get ingress -n backstage-prod
```

### 10. Verify Deployment

```bash
# Check pods are running
kubectl get pods -n backstage-prod

# Check logs
kubectl logs -l app=backstage -n backstage-prod
kubectl logs -l app=scaffolder-service -n backstage-prod

# Test endpoints
curl https://backstage.yourdomain.com/healthcheck
curl https://api.backstage.yourdomain.com/health
```

## Important Security Notes
cluster environments
### ⚠️ Docker Socket Removed
The production deployment does NOT mount `/var/run/docker.sock`. This is a critical security requirement.

**For building Docker images in production, use CI/CD instead:**

1. When a service is scaffolded, code is pushed to GitHub
2. GitHub Actions/GitLab CI/Jenkins builds the Docker image
3. CI/CD pushes image to registry
4. CI/CD updates Kubernetes deployment

Example GitHub Actions workflow (create in scaffolded repos):
```yaml
name: Build and Deploy
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - name: Build Docker image
      run: docker build -t yourorg/service:${{ github.sha }} .
    - name: Push to registry
      run: docker push yourorg/service:${{ github.sha }}
    - name: Deploy to Kubernetes
      run: kubectl set image deployment/service service=yourorg/service:${{ github.sha }}
```** (adjust based on environment):
   ```bash
   # Restricted for production
   kubectl label namespace backstage-prod pod-security.kubernetes.io/enforce=restricted
   
   # Baseline for dev/test
   kubectl label namespace backstage-dev pod-security.kubernetes.io/enforce=baseline

1. **Enable Pod Security Standards:**
   ```bash
   kubectl label namespace backstage-prod pod-security.kubernetes.io/enforce=restricted
   ```

2. **Create NetworkPolicies** to restrict pod-to-pod communication

3. **Use Secrets management:**
   - AWS: Secrets Manager + External Secrets Operator
   - GCP: Secret Manager + External Secrets Operator
   - Azure: Key Vault + External Secrets Operator

4. **Enable audit logging** at the cluster level

5. **Set up monitoring:**
   - Prometheus for metrics
   - Grafana for dashboards
   - Cloud provider logging (CloudWatch, Stackdriver, Azure Monitor)

## Scaling

### Horizontal Pod Autoscaling (HPA)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: scaffolder-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: scaffolder-service
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```** (critical for production):
```bash
# Use cloud provider snapshots or Velero
velero backup create backstage-backup --include-namespaces backstage-${ENV}
Consider using VPA for automatic resource adjustment.

## Backup and Disaster Recovery

**Backup PersistentVolumes:**
```bash
# Use cloud provider snapshots or Velero
velero backup create backstage-backup --include-namespaces backstage-prod
```

**Database Backups:**
If using PostgreSQL, set up automated backups through your cloud provider.

## Troubleshooting

```bash
# Check pod status
kubectl get pods -n backstage-prod

# View logs
kubectl logs -f deployment/scaffolder-service -n backstage-prod

# Describe resources
kubectl describe pod <pod-name> -n backstage-prod

# Check Ingress
kubectl describe ingress backstage-ingress -n backstage-prod

# Test service connectivity
kubectl run -it --rm debug --image=busybox --restart=Never -- wget -O- http://scaffolder-service:3000/health
```

## Cost Optimization

1. Use **cluster autoscaling** to scale nodes based on demand
2. Set appropriate **resource limits** to avoid over-provisioning
3. Use **spot/preemptible instances** for non-critical workloads
4. Implement **pod disruption budgets** for graceful scaling

## Next Steps

- Set up CI/CD pipelines for automated deployments
- Configure monitoring and alerting
- Implement backup strategies
- Set up disaster recovery procedures

## Scaffolder: Namespace selection

The Scaffolder supports selecting a Kubernetes namespace when scaffolding and deploying a service. Key points:

- The Backstage template exposes a `target_namespace` field that the user can set during scaffold.
- The scaffolder stores the chosen namespace in `scaffold-metadata.json` inside the generated project.
- During deployment the scaffolder will ensure the namespace exists (idempotent create) and apply manifests into that namespace.
- The scaffolder will refuse obvious system namespaces (for safety) and will not automatically modify cluster-wide resources without RBAC.

RBAC notes:

- If you want the scaffolder to create namespaces, the scaffolder ServiceAccount must be permitted to `create` and `apply` namespaces.
- The scaffolder also needs permissions to create/update/delete resources in the target namespace (Role/RoleBinding or ClusterRoleBinding). Prefer granting namespace-scoped Roles for least privilege.

If you prefer not to allow namespace creation, instruct users to create the namespace beforehand and set it in the template form.
- Configure authentication (OAuth, SAML)
- Enable audit logging
- Implement rate limiting and API quotas
