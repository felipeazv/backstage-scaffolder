# Minikube Local Development Deployment

This directory contains Kubernetes manifests optimized for local development with Minikube.

## Quick Start

### 1. Start Minikube
```bash
minikube start
```

### 2. Create GitHub Token Secret
```bash
kubectl create secret generic github-token --from-literal=token=ghp_YourTokenHere
```

### 3. Build and Load Images
```bash
# Build scaffolder service
cd ../../scaffolder-service
docker build -t scaffolder-service:latest .
minikube image load scaffolder-service:latest

# Build Backstage (if needed)
cd ../backstage/backstage-app
docker build -t backstage:latest .
minikube image load backstage:latest
```

### 4. Configure GitHub Owner

Create your local configuration file (this won't be committed to git):
```bash
cd backstage/minikube
cp config.yaml.template config.yaml
```

Edit `config.yaml` and set your GitHub username:
```yaml
data:
  GITHUB_OWNER: "your-actual-username"
```

Apply the configuration:
```bash
kubectl apply -f config.yaml
```

### 5. Deploy to Minikube

The deployment creates two namespaces:
- `backstage`: Platform services (Backstage UI + Scaffolder)  
- `development`: Generated microservices

```bash
cd ../..
kubectl apply -f backstage/minikube/backstage-deployment.yaml
```

This single command will:
- Create `backstage` and `development` namespaces
- Deploy Backstage UI and Scaffolder service to `backstage` namespace
- Set up cross-namespace RBAC for scaffolder to deploy to `development`
- Configure all necessary services and secrets

### 6. Access Services

The platform services run in the `backstage` namespace:

**Option A: Port Forwarding (Recommended)**
```bash
# Backstage UI
kubectl port-forward -n backstage svc/backstage-service 30700:7000

# Scaffolder API  
kubectl port-forward -n backstage svc/scaffolder-service 30300:3000
```

Then access:
- Backstage: http://localhost:30700
- Scaffolder API: http://localhost:30300

**Option B: Minikube Service URLs**
```bash
minikube service backstage-service --url -n backstage
minikube service scaffolder-service --url -n scaffolder
```

**Option C: Minikube Tunnel (for direct NodePort access)**
```bash
minikube tunnel
# Then access http://localhost:30700 and http://localhost:30300
```

### 7. Verify Generated Services

Generated services deploy to the `development` namespace:

```bash
# List all services in development namespace
kubectl get all -n development

# View service logs (replace <service-name> with actual service)
kubectl logs -n development deployment/<service-name>
```

## Development Features

### Fast Iteration
- Uses `imagePullPolicy: IfNotPresent` for faster local development
- No need to push images to a registry
- Quick rebuild and reload with `minikube image load`

### Docker Socket Access
- Scaffolder service has access to Docker socket
- ⚠️ **Development Only** - Never use in production for security reasons
- Allows building Docker images directly from scaffolded services

### NodePort Services
- Direct access via `localhost:30700` and `localhost:30300`
- No need for Ingress controller setup

### Local Storage
- Uses `emptyDir` for fast local storage
- Data is ephemeral (lost on pod restart)
- Fine for development, use PVC in production

## Troubleshooting

### Images Not Found
```bash
# List images loaded in Minikube
minikube image ls | grep scaffolder

# Reload if needed
minikube image load scaffolder-service:latest
```

### Pod Not Starting
```bash
# Check pod status
kubectl get pods

# View logs
kubectl logs -l app=scaffolder-service

# Describe pod for events
kubectl describe pod <pod-name>
```

### Port Already in Use
```bash
# Check what's using the port
lsof -i :30700

# Kill the process or use different ports
```

### Minikube Not Running
```bash
# Check status
minikube status

# Start if stopped
minikube start

# Or delete and recreate
minikube delete
minikube start
```

## Rebuilding After Code Changes

```bash
# 1. Make code changes
# 2. Rebuild Docker image
cd scaffolder-service
docker build -t scaffolder-service:latest .

# 3. Load into Minikube
minikube image load scaffolder-service:latest

# 4. Restart deployment
kubectl rollout restart deployment/scaffolder-service

# 5. Watch restart
kubectl get pods -w -n backstage
```

## Namespace Benefits

### Service Isolation
- **Platform services** (`backstage` namespace) are isolated from **application services** (`development`)
- Prevents accidental interference between platform and generated services
- Clean separation of concerns for RBAC and resource management

### Simplified Operations
- All generated services consistently deploy to `development` namespace
- Easy to manage, monitor, and clean up generated services
- Clear service discovery within namespace boundaries

### Security
- Scaffolder service runs with minimal permissions
- Cross-namespace RBAC strictly limits deployment target
- Platform services protected from generated service failures

### Development Workflow
```bash
# View platform services
kubectl get all -n backstage

# View your generated services  
kubectl get all -n development

# Clean up only generated services
kubectl delete all --all -n development

# Clean up everything
kubectl delete namespace backstage development
```

## Cleanup

```bash
# Clean up only generated services (keeps platform running)
kubectl delete all --all -n development

# Clean up everything (complete teardown)  
kubectl delete namespace backstage development

# Or use deployment files
kubectl delete -f backstage/minikube/backstage-deployment.yaml

# Stop Minikube
minikube stop

# Delete Minikube cluster (complete cleanup)
minikube delete
```
