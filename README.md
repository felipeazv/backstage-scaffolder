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
├── backstage/              # Backstage app & templates
├── scaffolder-service/     # Custom scaffolding API
├── hello-world/            # Sample Spring Boot app
└── scaffolded-projects/    # Generated services
```

### Components

- **Backstage**: Developer portal UI running on port 30700
- **Scaffolder Service**: REST API for project generation (port 30300)
- **Minikube**: Local Kubernetes cluster for deployments
- **Sample Projects**: Reference implementations for scaffolding

## Prerequisites

- Docker Desktop
- Minikube installed and running
- kubectl CLI
- Java 21+ (for local Spring Boot development)
- Maven 3.6+
- Node.js 18+ (for Backstage development)

## Quick Start

### 1. Start Minikube

```bash
minikube start
```

### 2. Deploy Backstage and Scaffolder Services

Deploy the complete stack to Minikube:

```bash
cd backstage
kubectl apply -f minikube-deployment-final.yaml
```

Wait for pods to be ready (this may take a few minutes):

```bash
kubectl get pods -w
```

Press `Ctrl+C` once you see both pods are `Running` and `READY 1/1`.

Verify deployments:

```bash
kubectl get deployments
kubectl get services
```

You should see:
- `backstage` deployment and `backstage-service` (NodePort 30700)
- `scaffolder-service` deployment and service (NodePort 30300)

### 3. Access Minikube Dashboard (Optional)

```bash
minikube dashboard
```

Or get the URL without opening the browser:

```bash
minikube dashboard --url
```

### 4. Set Up Port Forwards

Run these commands in separate terminals to access the services:

**Backstage UI** → localhost:30700
```bash
kubectl port-forward svc/backstage-service 30700:7000 --address=127.0.0.1
```

**Scaffolder API** → localhost:30300
```bash
kubectl port-forward svc/scaffolder-service 30300:3000 --address=127.0.0.1
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
- Generate a Spring Boot project from template
- Build a Docker image
- Deploy to Minikube
- Expose the service via NodePort

## Managing Scaffolded Services

### View Deployed Services

```bash
kubectl get deployments
kubectl get services
kubectl get pods
```

### Access a Scaffolded Service

**Option 1: Port forwarding**
```bash
kubectl port-forward service/<service-name>-service <port>:<port>
```

**Option 2: Minikube service**
```bash
minikube service <service-name>-service
```

**Option 3: Get NodePort URL**
```bash
minikube service <service-name>-service --url
```

### Delete a Scaffolded Service

```bash
# Replace <name> with your service name
kubectl delete deployment <name>
kubectl delete service <name>-service
```

Or delete by label:
```bash
kubectl delete deployment,service -l app=<name>
```

## Cleaning Up

To completely remove Backstage and Scaffolder from Minikube:

```bash
cd backstage
kubectl delete -f minikube-deployment-final.yaml
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

**Current Behavior:**
- Projects are scaffolded into ephemeral K8s volumes (`emptyDir`)
- Each pod restart clears the volume
- Duplicate naming is only validated within the current pod session

**Planned Approach:**
Integrate with Backstage Catalog for persistent duplicate detection and future git integration:

1. **Before scaffolding** → Query Backstage Catalog API for existing components
   - Check: `GET /api/catalog/entities?filter=kind=component&name=<component_id>`
   - Reject if component already exists

2. **After successful deployment** → Register new component in Catalog
   - Create: `POST /api/catalog/entities` with scaffolded service metadata

3. **Future git integration** → Catalog entries point to repository URLs
   - Each scaffolded project auto-registered with git repo link
   - Single source of truth across pod restarts and replicas

This keeps naming validation persistent and bridges naturally to a git-based workflow.

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
