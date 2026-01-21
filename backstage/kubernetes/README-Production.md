# Production Deployment Setup

This directory contains configuration files for deploying Backstage platform in a production-like environment for testing and validation.

## 🎯 **Architecture**

### **Namespace Strategy:**
- `backstage-prod` - Platform services (Backstage + Scaffolder Service)
- `stage` - Target namespace for scaffolded services
- `backstage` - Development environment (unchanged)
- `development` - Development services target (unchanged)

## 📁 **Files Overview**

### **prod-namespace-setup.yaml**
Creates namespaces, service accounts, and RBAC permissions:
- `backstage-prod` and `stage` namespaces
- Service account with permissions for cross-namespace deployment
- GitHub token secret placeholder

### **prod-scaffolder-deployment.yaml**
Scaffolder service configured for production:
- Deploys to `backstage-prod` namespace
- Uses `TARGET_NAMESPACE=stage` environment variable
- 2 replicas for high availability
- Production resource limits

### **prod-backstage-deployment.yaml**
Backstage frontend configured for production:
- Deploys to `backstage-prod` namespace
- Connects to production scaffolder service
- 2 replicas for high availability
- Production-ready configuration

## 🚀 **Deployment Instructions**

### **1. Setup Namespaces and RBAC:**
```bash
kubectl apply -f prod-namespace-setup.yaml
```

### **2. Update GitHub Token:**
```bash
# Replace with your actual GitHub token
kubectl create secret generic github-token \
  --from-literal=token=YOUR_GITHUB_TOKEN \
  -n backstage-prod --dry-run=client -o yaml | kubectl apply -f -
```

### **3. Update Container Registry References:**
Edit the following files and replace placeholders:
- `prod-scaffolder-deployment.yaml`: Update `image: scaffolder-service:v9` 
- `prod-backstage-deployment.yaml`: Update `image: backstage-frontend:latest`
- `prod-scaffolder-deployment.yaml`: Update `GITHUB_OWNER` value

For production, use your container registry:
```yaml
# Examples:
image: docker.io/yourorg/scaffolder-service:v9
image: gcr.io/your-project/backstage-frontend:latest
image: your-account.dkr.ecr.region.amazonaws.com/scaffolder-service:v9
```

### **4. Deploy Scaffolder Service:**
```bash
kubectl apply -f prod-scaffolder-deployment.yaml
```

### **5. Deploy Backstage Frontend:**
```bash
kubectl apply -f prod-backstage-deployment.yaml
```

## 🧪 **Testing with Minikube**

For local testing, you can use the existing images:

```bash
# Ensure minikube can access local images
eval $(minikube docker-env)
docker build -t scaffolder-service:v9 /path/to/scaffolder-service

# Deploy with current images
kubectl apply -f prod-namespace-setup.yaml
kubectl apply -f prod-scaffolder-deployment.yaml
kubectl apply -f prod-backstage-deployment.yaml

# Port forward for testing
kubectl port-forward -n backstage-prod svc/backstage 7008:7007 &
kubectl port-forward -n backstage-prod svc/scaffolder-service 3001:3000 &
```

## ✅ **Validation**

### **Check Deployments:**
```bash
kubectl get all -n backstage-prod
kubectl get all -n stage
```

### **Test Service Creation:**
1. Access Backstage at `http://localhost:7008`
2. Create a new service through the scaffolder
3. Verify service deploys to `stage` namespace:
```bash
kubectl get all -n stage
```

### **Verify Environment Variables:**
```bash
kubectl exec -n backstage-prod deployment/scaffolder-service -- env | grep TARGET_NAMESPACE
```

## 🔒 **Security Notes**

- Service accounts use least-privilege RBAC
- No Docker socket mounting in production
- Images should be built via CI/CD pipeline
- Secrets should be managed via external secret management
- Consider network policies for namespace isolation

## 🔄 **Differences from Development Setup**

| Component | Development | Production |
|-----------|-------------|------------|
| **Scaffolder Namespace** | `backstage` | `backstage-prod` |
| **Target Namespace** | `development` | `stage` |
| **Replicas** | 1 | 2 |
| **Image Pull Policy** | `IfNotPresent` | `Always` |
| **Resource Limits** | Basic | Production-sized |
| **Security Context** | Standard | Enhanced |

## 🚨 **Important Notes**

1. **Existing Setup Unaffected**: The `backstage` and `development` namespaces continue working unchanged
2. **Image Compatibility**: Same codebase, different configuration via environment variables
3. **RBAC Isolation**: Production services can only deploy to `stage` namespace
4. **Testing Independence**: Can test production deployment files without affecting development

## 🛠️ **Troubleshooting**

### **Common Issues:**

**Images not found:**
```bash
# For minikube, ensure docker env is set
eval $(minikube docker-env)
docker images | grep scaffolder-service
```

**Permission denied:**
```bash
# Check RBAC
kubectl auth can-i create deployments --as=system:serviceaccount:backstage-prod:scaffolder-deployer -n stage
```

**Service not deploying to stage:**
```bash
# Check environment variable
kubectl logs -n backstage-prod deployment/scaffolder-service | grep TARGET_NAMESPACE
```