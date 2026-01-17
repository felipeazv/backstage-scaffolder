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

### 4. Deploy to Minikube
```bash
cd ../..
kubectl apply -f backstage/minikube/backstage-deployment.yaml
kubectl apply -f backstage/minikube/scaffolder-deployment.yaml
```

### 5. Access Services

**Option A: Port Forwarding (Recommended)**
```bash
# Backstage UI
kubectl port-forward svc/backstage-service 30700:7000

# Scaffolder API
kubectl port-forward svc/scaffolder-service 30300:3000
```

Then access:
- Backstage: http://localhost:30700
- Scaffolder API: http://localhost:30300

**Option B: Minikube Service URLs**
```bash
minikube service backstage-service --url
minikube service scaffolder-service --url
```

**Option C: Minikube Tunnel (for direct NodePort access)**
```bash
minikube tunnel
# Then access http://localhost:30700 and http://localhost:30300
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
kubectl get pods -w
```

## Cleanup

```bash
# Delete all resources
kubectl delete -f backstage/minikube/

# Or delete everything in namespace
kubectl delete all --all

# Stop Minikube
minikube stop

# Delete Minikube cluster (complete cleanup)
minikube delete
```
