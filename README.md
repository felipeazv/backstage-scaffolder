# Backstage Scaffolder Project

A local Backstage developer portal for scaffolding Spring Boot microservices with automated Kubernetes deployment on Minikube.

> **📋 Architecture Note**: This implementation follows a **simplified deployment model** for rapid development and prototyping. Backstage performs **direct deployment to Kubernetes** without traditional CI/CD pipeline integration (Jenkins, GitLab CI, GitHub Actions, etc.). This approach enables immediate service deployment and testing, making it ideal for local development, proof-of-concepts, and learning environments. For production scenarios, consider integrating with your organization's existing CI/CD tooling.

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
- **Scaffolder Service**: REST API for project generation with PostgreSQL support (port 30300 in Minikube)

### Service Generation Options

**Basic Services:**
- Spring Boot applications (Java 11/17/21)
- REST API endpoints
- Docker containerization
- Kubernetes deployment

**Persistence-Enabled Services (PostgreSQL):**
- Everything above, plus:
- PostgreSQL StatefulSet with persistent storage
- Spring Data JPA integration
- Flyway database migrations
- Sample data generation (hello-world table with 20 records)
- Database connection pooling
- Environment-based configuration

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

### Deployment Flow

**Direct Deployment Model** (this implementation):

**For Basic Services:**
```
User → Backstage UI → Scaffolder Service → Docker Build → K8s Deploy → Running Service
```

**For PostgreSQL-Enabled Services:**
```
User → Backstage UI → Scaffolder Service → Generate JPA Code → Deploy PostgreSQL → Docker Build → K8s Deploy → Connected Service
```

1. User fills service form in Backstage UI
2. Scaffolder service generates Spring Boot project with chosen features
3. **If PostgreSQL selected**: Deploys PostgreSQL StatefulSet with persistent storage
4. **If PostgreSQL selected**: Runs Flyway migrations and inserts sample data
5. Scaffolder builds Docker image with database connectivity
6. Scaffolder deploys service to Kubernetes with environment variables
7. Service is available with database integration within seconds

**vs Traditional CI/CD Model**:
```
User → Backstage → Git Push → CI Pipeline → Build → Test → Deploy → Running Service
```

**Benefits of Direct Deployment:**
- ⚡ **Immediate feedback**: Services available in seconds
- 🔄 **Rapid iteration**: Perfect for development and prototyping  
- 🎯 **Simplified setup**: No external CI/CD infrastructure required
- 📍 **Local development**: Ideal for learning and experimentation

**Production Considerations:**
- For production environments, integrate with your CI/CD pipeline (Jenkins, GitHub Actions, etc.)
- Use this setup for development, testing, and proof-of-concepts
- Consider security implications of direct Docker socket access

### Project Structure

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
   docker build -t scaffolder-service:v8 .
   minikube image load scaffolder-service:v8
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
   - **Java Version**: Select Java 11, 17, or 21
   - **Persistence Layer**: Choose between:
     - **No Database** - Basic service without persistence
     - **PostgreSQL 🐘** - Full-featured PostgreSQL database integration
3. Click "Create" to scaffold and deploy

The scaffolder will:
- **Check GitHub** for existing repository (prevents duplicates)
- Generate a Spring Boot project from template with selected features
- **Configure PostgreSQL** if selected (includes JPA, Flyway, sample data)
- **Create GitHub repository** (if GitHub integration enabled)
- **Push code to GitHub** with initial commit
- Build and deploy service Docker image
- **Deploy PostgreSQL StatefulSet** (if persistence layer selected)
- Deploy service to Kubernetes with database connectivity
- Expose the service via NodePort

## Persistence Layer Features

When PostgreSQL is selected, the scaffolder creates:

### Database Architecture
- **Isolated PostgreSQL instance** per service (StatefulSet with persistent storage)
- **Database connection pooling** with HikariCP
- **Environment-based configuration** (dev, test, prod profiles)
- **Kubernetes secrets** for secure credential management
- **Persistent volumes** ensuring data survives pod restarts

### Generated Code Components
- **Spring Data JPA entities** with sample `HelloWorld` model
- **JPA repositories** with CRUD operations
- **REST controllers** exposing database endpoints
- **Database configuration** with PostgreSQL driver
- **Flyway migrations** for schema versioning and sample data

### Sample Data & API Endpoints
Each PostgreSQL-enabled service includes:
- **Auto-generated sample data**: 20 records with random adjective + noun nicknames
- **REST API endpoints**:
  - `GET /api/hello-world` - List all records (paginated)
  - `GET /api/hello-world/{id}` - Get specific record
  - `POST /api/hello-world` - Create new record
  - `PUT /api/hello-world/{id}` - Update record
  - `DELETE /api/hello-world/{id}` - Delete record

### Database Schema
```sql
-- V1__Create_hello_world_table.sql
CREATE TABLE hello_world (
    id BIGSERIAL PRIMARY KEY,
    nickname VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Testing Database Integration
Once deployed, test your service's database endpoints:

```bash
# Get service URL (replace <service-name> with your actual service name)
SERVICE_URL=$(minikube service <service-name>-service --url -n development)

# List all hello-world records
curl $SERVICE_URL/api/hello-world

# Get a specific record
curl $SERVICE_URL/api/hello-world/1

# Create a new record
curl -X POST $SERVICE_URL/api/hello-world \
  -H "Content-Type: application/json" \
  -d '{"nickname": "brave-eagle"}'
```

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
# All services in development namespace
kubectl get deployments,services,statefulsets -n development

# View all pods (services + databases)
kubectl get pods -n development

# Check persistent volumes for database storage
kubectl get pvc -n development
```

### Access a Scaffolded Service

Generated services deploy to the `development` namespace by default (or `stage` in production environment). To access them:

**⭐ Recommended: minikube service (Most Reliable)**
```bash
# Opens browser or provides localhost URL
minikube service <service-name>-service -n development

# Example output: http://127.0.0.1:52431
# This method bypasses Docker networking limitations
```

**Option 2: Port forwarding (Development)**
```bash
kubectl port-forward -n development svc/<service-name>-service 8080:8080
# Access via http://localhost:8080
```

**Option 3: Get NodePort URL**
```bash
minikube service <service-name>-service --url -n development
# Returns localhost URL for programmatic access
```

#### ⚠️ Important: External IP Limitations

When using minikube with Docker driver on macOS:
- **LoadBalancer external IPs** (like `192.168.49.100`) exist only inside Docker container
- **NodePort direct access** via minikube IP may not work due to Docker networking
- **`minikube tunnel`** has limited reliability on macOS with Docker driver

**✅ Always use `minikube service` or `kubectl port-forward` for reliable external access**

### Database Management

For services with PostgreSQL persistence:

**Connect to PostgreSQL directly:**
```bash
# Get database pod name
kubectl get pods -n development -l app=<service-name>-postgres

# Connect to PostgreSQL shell
kubectl exec -it -n development <service-name>-postgres-0 -- psql -U postgres -d <service-name>

# Example queries
\l                    # List databases
\c <service-name>     # Connect to service database
\dt                   # List tables
SELECT * FROM hello_world LIMIT 10;  # Query sample data
```

**View database logs:**
```bash
kubectl logs -n development <service-name>-postgres-0
```

**Check database storage:**
```bash
kubectl get pvc -n development
kubectl describe pvc <service-name>-postgres-storage -n development
```

### Delete a Scaffolded Service

Services are deployed to the `development` namespace. For complete cleanup:

**With PostgreSQL persistence:**
```bash
# Replace <name> with your service name
kubectl delete deployment <name> -n development
kubectl delete service <name>-service -n development
kubectl delete statefulset <name>-postgres -n development
kubectl delete service <name>-postgres-service -n development
kubectl delete secret <name>-postgres-secret -n development
kubectl delete pvc <name>-postgres-storage -n development
```

**Basic services (no database):**
```bash
kubectl delete deployment <name> -n development
kubectl delete service <name>-service -n development
```

**Delete by label (all resources for a service):**
```bash
kubectl delete all,pvc,secrets -l app=<name> -n development
```

**Clean up all generated services at once:**
```bash
kubectl delete all,pvc,secrets --all -n development
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
# For services in development namespace
kubectl get pods -n development
kubectl logs <pod-name> -n development
kubectl describe pod <pod-name> -n development

# For platform services in backstage namespace
kubectl get pods -n backstage
kubectl logs <pod-name> -n backstage
kubectl describe pod <pod-name> -n backstage
```

### Database Connection Issues

For PostgreSQL-enabled services:

**Check database pod status:**
```bash
kubectl get pods -n development -l app=<service-name>-postgres
kubectl logs <service-name>-postgres-0 -n development
```

**Test database connectivity:**
```bash
# Connect to PostgreSQL pod
kubectl exec -it -n development <service-name>-postgres-0 -- psql -U postgres

# Check databases
\l

# Connect to service database
\c <service-name>

# Verify sample data
SELECT COUNT(*) FROM hello_world;
```

**Check service database configuration:**
```bash
# Check if database secret exists
kubectl get secret <service-name>-postgres-secret -n development

# View service environment variables
kubectl describe pod <service-name>-<pod-suffix> -n development
```

### Scaffolding Failures

**Check scaffolder service logs:**
```bash
kubectl logs -n backstage deployment/scaffolder-service
```

**Common issues:**
- **GitHub token expired**: Update the `github-token` secret
- **Insufficient RBAC**: Ensure ClusterRole includes all required permissions
- **Namespace issues**: Verify development namespace exists
- **Image pull errors**: Check if Docker images are properly loaded in Minikube

### Storage Issues (PostgreSQL)

**Check persistent volumes:**
```bash
kubectl get pvc -n development
kubectl describe pvc <service-name>-postgres-storage -n development
```

**If PVC is stuck in Pending:**
```bash
# Check if storage class exists
kubectl get storageclass

# For Minikube, ensure it's started properly
minikube addons enable default-storageclass
minikube addons enable storage-provisioner
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

Re-load custom images after Minikube restart:
```bash
cd scaffolder-service
docker build -t scaffolder-service:latest .
minikube image load scaffolder-service:latest
```

## Environment Switching

The project includes environment switching capabilities for different deployment targets:

### Switch Between Development and Production

```bash
# Switch to production environment (backstage-prod namespace)
./switch-env.sh prod

# Switch to development environment (backstage namespace)  
./switch-env.sh dev

# Check current environment
kubectl config current-context
kubectl get pods -n backstage
kubectl get pods -n backstage-prod
```

### How It Works

The `switch-env.sh` script manages deployments across two isolated environments:

**Development Environment (`./switch-env.sh dev`):**
- Deploys Backstage platform to `backstage` namespace
- Scaffolder targets `development` namespace for new services
- Ideal for feature development and testing

**Production Environment (`./switch-env.sh prod`):**
- Deploys Backstage platform to `backstage-prod` namespace
- Scaffolder targets `stage` namespace for new services
- Used for staging, QA, and production-like testing

### Environment Configuration

Environment targeting is controlled by the `TARGET_NAMESPACE` environment variable in the scaffolder service:

```yaml
# Development environment
env:
  - name: TARGET_NAMESPACE
    value: "development"  # New services go here

# Production environment
env:
  - name: TARGET_NAMESPACE
    value: "stage"       # New services go here
```

### Namespace Architecture

```
backstage/              # Development environment
├── backstage           # Backstage app
├── scaffolder-service  # Targets 'development' namespace
└── secrets/configs

backstage-prod/         # Production environment
├── backstage           # Backstage app (prod config)
├── scaffolder-service  # Targets 'stage' namespace
└── secrets/configs

development/            # Generated services (dev env)
stage/                  # Generated services (prod env)
```

### Use Cases

**Team Workflow:**
```bash
# Developer working on new features
./switch-env.sh dev
# Deploy and test services in development namespace

# QA testing release candidates  
./switch-env.sh prod
# Deploy and test services in stage namespace
```

**CI/CD Integration:**
- Different pipelines can target different environments
- Automated testing in stage namespace
- Development work isolated in development namespace

### External Service Access

Services in both environments can be accessed using the same methods:

```bash
# Development environment services
minikube service <service-name> -n development

# Production environment services (stage namespace)
minikube service <service-name> -n stage
```

## Technologies

### Core Platform
- **Backstage**: Spotify's open-source developer portal
- **Node.js**: Scaffolder service runtime
- **Kubernetes**: Container orchestration (via Minikube)
- **Docker**: Containerization

### Generated Services
- **Spring Boot**: Java microservices framework (versions 11/17/21)
- **Maven**: Java build tool
- **PostgreSQL**: Relational database (optional)
- **Spring Data JPA**: Database abstraction layer
- **Flyway**: Database migration tool
- **HikariCP**: High-performance connection pooling

## Contributing

### Adding New Templates

When adding new service templates:
1. Create template YAML in `backstage/templates/`
2. Update scaffolder service logic in `scaffolder-service/server.js`
3. Add new database support (if needed) following PostgreSQL example
4. Test scaffolding through the Backstage UI
5. Verify deployment to Minikube with all features
6. Update documentation to reflect new capabilities

### Extending Database Support

To add support for additional databases:
1. **Update UI**: Add new option to persistence dropdown in `CreateServicePage.js`
2. **Scaffolder Logic**: Add database-specific generators in `scaffolder-service/server.js`
3. **Dependencies**: Update `generatePomXml()` with required dependencies
4. **Kubernetes Resources**: Create database deployment templates
5. **Migrations**: Add database-specific migration patterns
6. **Configuration**: Update application properties templates
7. **RBAC**: Ensure ClusterRole includes necessary permissions

### Testing Changes

Before submitting changes:
```bash
# Test basic service creation
1. Test service without persistence
2. Test service with PostgreSQL persistence
3. Verify database connectivity and sample data
4. Test service deletion and cleanup
5. Check logs for any errors

# Validate deployment
kubectl get all,pvc,secrets -n development
```

## Troubleshooting

### Java 11 + PostgreSQL Issues
If a Java 11 service with PostgreSQL doesn't connect to the database:
- **Symptom**: Service starts but no database endpoints work, no database health indicators
- **Cause**: Wrong JPA imports (old scaffolder versions used `jakarta.persistence.*` for all Java versions)
- **Solution**: Use scaffolder v7+ which automatically uses correct imports:
  - Java 11: `javax.persistence.*` (Spring Boot 2.7.x)
  - Java 17+: `jakarta.persistence.*` (Spring Boot 3.x)

### Cleanup Issues
If PostgreSQL resources remain after service deletion:
- **Symptom**: Orphaned services like `servicename-postgres` or PVCs `postgres-storage-servicename-postgres-0`
- **Cause**: Resource naming pattern mismatch in older scaffolder versions
- **Solution**: Use scaffolder v8+ with fixed cleanup patterns, or manually delete:
  ```bash
  kubectl delete service servicename-postgres -n development
  kubectl delete pvc postgres-storage-servicename-postgres-0 -n development
  ```

### Common Issues
- **Port conflicts**: Services use NodePort 30000+ range. Check existing services: `kubectl get svc -A`
- **Image pull errors**: Ensure `minikube image load` completed successfully
- **GitHub integration**: Verify token has `repo` and `delete_repo` scopes

## License

Internal project for development use.
