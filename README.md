# Backstage Scaffolder Project

A local Backstage developer portal for scaffolding Spring Boot microservices with automated Kubernetes deployment on Minikube.

## Overview

This project provides a complete developer platform that enables teams to:
- **Scaffold** new Spring Boot services through a web UI
- **Deploy** services automatically to Minikube
- **Monitor** deployments in real-time
- **Manage** service lifecycle through standardized templates

## Architecture

```
backstage-scaffolder/
├── backstage/
│   ├── minikube/           # Local development deployment configs
│   ├── kubernetes/         # Kubernetes manifests for all environments
│   ├── backstage-app/      # Backstage application code
│   └── templates/          # Service scaffolding templates
├── scaffolder-service/     # Custom scaffolding API
├── hello-world/            # Sample Spring Boot app
└── scaffolded-projects/    # Generated services (local)
```

### Components

- **Backstage**: Developer portal UI (port 30700 in Minikube)
- **Scaffolder Service**: REST API for project generation (port 30300 in Minikube)

### Namespace Architecture

The platform uses a multi-namespace architecture for service isolation:

- **`backstage` namespace**: Platform services
  - Backstage UI (developer portal)
  - Scaffolder service (project generator)
  - Supporting secrets and configurations
- **`development` namespace**: Generated microservices
  - All scaffolded Spring Boot services deploy here
  - Isolated from platform services for security
  - Simplified service discovery within namespace
- **Deployment Configs**:
  - `backstage/minikube/` - Local development with Minikube
  - `backstage/kubernetes/` - K8s manifests for dev, test, stage, prod environments
- **Sample Projects**: Reference implementations for scaffolding

## Prerequisites

### For Local Development (Minikube)
- Docker Desktop
- Minikube installed and running
- kubectl CLI
- Java 21+ (for local Spring Boot development)
- Maven 3.6+
- Node.js 18+ (for Backstage development)
- GitHub Personal Access Token (with `repo` and `delete_repo` scopes)

### For Kubernetes Cluster Deployment
See [`backstage/kubernetes/README.md`](backstage/kubernetes/README.md) for cluster deployment prerequisites including:
- Kubernetes cluster (GKE, EKS, AKS, or self-managed)
- Container registry (Docker Hub, GCR, ECR, ACR)
- Ingress controller
- Domain name and DNS configuration
- TLS/SSL certificates (via cert-manager or cloud provider)

## Deployment Options

Choose your deployment environment:

- **[Local Development (Minikube)](backstage/minikube/README.md)** - Fast local iteration, NodePort access, Docker socket mounting
- **[Kubernetes Cluster Deployment](backstage/kubernetes/README.md)** - For dev, test, stage, prod - HA setup, Ingress, PVC, security hardened, CI/CD ready

---

## Quick Start (Minikube)

For full Minikube setup instructions, see [`backstage/minikube/README.md`](backstage/minikube/README.md)

## Quick Start

### 1. Start Minikube

```bash
minikube start
```

### 2. Configure GitHub Integration (Required for Production)

To enable automatic GitHub repository creation:

1. Create a GitHub Personal Access Token (PAT):
   - Go to https://github.com/settings/tokens/new
   - Click "Generate new token (classic)"
   - Name: "Backstage Scaffolder"
   - **Required Scopes:**
     - ✅ `repo` (Full control of private repositories)
     - ✅ `delete_repo` (Delete repositories - needed for cleanup)
   - Click "Generate token"
   - **Copy the token** (starts with `ghp_` - you won't see it again!)

2. Create Kubernetes secret:
   ```bash
   kubectl create secret generic github-token --from-literal=token=YOUR_TOKEN_HERE
   ```

   Example:
   ```bash
   kubectl create secret generic github-token --from-literal=token=ghp_YourActualTokenHere
   ```

3. Configure GitHub owner using the ConfigMap (recommended):

   Copy the local config template and set your GitHub username (this file is gitignored):

   ```bash
   cd backstage/minikube
   cp config.yaml.template config.yaml
   # edit config.yaml and set your GitHub username for GITHUB_OWNER
   kubectl apply -f config.yaml
   ```

   This populates a `ConfigMap` named `scaffolder-config` which the Scaffolder Deployment reads for `GITHUB_OWNER`.

   If you need to update the GitHub token later, recreate the secret and restart the deployment:

   ```bash
   kubectl create secret generic github-token --from-literal=token=YOUR_NEW_TOKEN --dry-run=client -o yaml | kubectl apply -f -
   kubectl rollout restart deployment/scaffolder-service
   ```

3. Build and load the scaffolder service image:
   ```bash
   cd scaffolder-service
   docker build -t scaffolder-service:latest .
   minikube image load scaffolder-service:latest
   cd ..
   ```

**Note**: If you skip GitHub setup, services will still be scaffolded but won't be pushed to GitHub.

### 3. Deploy Backstage and Scaffolder Services

Deploy the complete stack to Minikube with namespace isolation:

```bash
cd backstage/minikube
kubectl apply -f backstage-deployment.yaml
```

This creates:
- `backstage` namespace: Platform services (Backstage UI + Scaffolder)
- `development` namespace: Target for all generated services
- Cross-namespace RBAC for secure service deployment

Wait for pods to be ready in the backstage namespace:

```bash
kubectl get pods -n backstage -w
```

Press `Ctrl+C` once you see both pods are `Running` and `READY 1/1`.

Verify deployments in the backstage namespace:

```bash
kubectl get all -n backstage
```

You should see:
- `backstage` deployment and `backstage-service` (NodePort 30700)
- `scaffolder-service` deployment and service (NodePort 30300)

Verify the development namespace was created for generated services:

```bash
kubectl get namespace development
```

### 4. Access Minikube Dashboard (Optional)

```bash
minikube dashboard
```

Or get the URL without opening the browser:

```bash
minikube dashboard --url
```

### 4. Set Up Port Forwards

Run these commands in separate terminals to access the services in the backstage namespace:

**Backstage UI** → localhost:30700
```bash
kubectl port-forward -n backstage svc/backstage-service 30700:7000 --address=127.0.0.1
```

**Scaffolder API** → localhost:30300
```bash
kubectl port-forward -n backstage svc/scaffolder-service 30300:3000 --address=127.0.0.1
```

### 5. Access Backstage

Open your browser to:
```
http://localhost:30700
```

## Using the Scaffolder

1. Navigate to the Backstage UI at `http://localhost:30700`
2. Fill in the service details:
   - **Component ID**: Unique service identifier (e.g., `user-service`)
   - **Port**: Service port (e.g., `8080`)
   - **Description**: Brief service description
3. Click "Create" to scaffold and deploy

The scaffolder will:
- **Check GitHub** for existing repository (prevents duplicates)
- Generate a Spring Boot project from template
- **Create GitHub repository** (if GitHub integration enabled)
- **Push code to GitHub** with initial commit
- Build a Docker image
- Deploy to Minikube
- Expose the service via NodePort

**With GitHub Integration Enabled:**
- Each service automatically gets its own GitHub repository
- Repository URL: `https://github.com/YOUR_OWNER/service-name`
- Clone with: `git clone https://github.com/YOUR_OWNER/service-name.git`
- Name conflicts prevented by checking existing GitHub repos

**Without GitHub Integration:**
- Services scaffolded locally in the pod only
- Files stored in ephemeral storage (lost on pod restart)

## Managing Scaffolded Services

### View Deployed Services

```bash
kubectl get deployments
kubectl get services
kubectl get pods
```

### Access a Scaffolded Service

Generated services deploy to the `development` namespace. To access them:

**Option 1: Port forwarding**
```bash
kubectl port-forward -n development service/<service-name>-service <port>:<port>
```

**Option 2: Minikube service**
```bash
minikube service <service-name>-service -n development
```

**Option 3: Get NodePort URL**
```bash
minikube service <service-name>-service --url -n development
```

### Delete a Scaffolded Service

Services are deployed to the `development` namespace:

```bash
# Replace <name> with your service name  
kubectl delete deployment <name> -n development
kubectl delete service <name>-service -n development
```

Or delete by label:
```bash
kubectl delete deployment,service -l app=<name> -n development
```

Or clean up all generated services at once:
```bash
kubectl delete all --all -n development
```

## Cleaning Up

To completely remove Backstage and Scaffolder from Minikube:

```bash
# Clean up platform and all generated services
kubectl delete namespace backstage development

# Or use deployment file
kubectl delete -f backstage/minikube/backstage-deployment.yaml
```

Or delete specific resources:

```bash
kubectl delete deployment backstage scaffolder-service
kubectl delete service backstage-service scaffolder-service
kubectl delete serviceaccount scaffolder-deployer
kubectl delete clusterrolebinding scaffolder-deployer
kubectl delete clusterrole scaffolder-deployer
```

## Project Naming & Validation

**Current Implementation (GitHub Integration):**
When GitHub integration is enabled:
- Before scaffolding → Checks if GitHub repository exists
- If exists → Returns 409 Conflict error
- If new → Creates repository and pushes code
- Naming is validated against existing GitHub repositories
- Prevents duplicate project names across pod restarts

**Without GitHub Integration:**
- Projects scaffolded into ephemeral K8s volumes (`emptyDir`)
- Each pod restart clears the volume
- Duplicate naming only validated within current pod session

**Recommendation**: Always enable GitHub integration for production use.

## Development

### Backstage App

Located in `backstage/backstage-app/`:
```bash
cd backstage/backstage-app
yarn install
yarn dev
```

### Scaffolder Service

Located in `scaffolder-service/`:
```bash
cd scaffolder-service
npm install
node server.js
```

### Sample Applications

See individual project READMEs:
- [hello-world](./hello-world/README.md) - Spring Boot sample application

## Kubernetes Deployment Files

The `backstage/` directory contains several deployment configurations:
- `minikube-deployment.yaml` - Basic deployment
- `minikube-deployment-final.yaml` - Production configuration
- `minikube-deployment-pvc.yaml` - With persistent volume claims
- `minikube-deployment-combined.yaml` - All-in-one deployment

## Troubleshooting

### Services Not Accessible

Check port-forwards are running:
```bash
ps aux | grep "port-forward"
```

Restart port-forwards if needed (see Quick Start step 3).

### Pod Not Starting

Check pod logs:
```bash
kubectl get pods
kubectl logs <pod-name>
kubectl describe pod <pod-name>
```

### Minikube Issues

Restart Minikube:
```bash
minikube stop
minikube start
```

Check Minikube status:
```bash
minikube status
```

## Technologies

- **Backstage**: Spotify's open-source developer portal
- **Spring Boot**: Java microservices framework
- **Kubernetes**: Container orchestration (via Minikube)
- **Docker**: Containerization
- **Node.js**: Scaffolder service runtime
- **Maven**: Java build tool

## Contributing

When adding new templates:
1. Create template YAML in `backstage/templates/`
2. Update scaffolder service logic if needed
3. Test scaffolding through the UI
4. Verify deployment to Minikube

## License

Internal project for development use.
