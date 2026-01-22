# Migration Guide to Scaffolder Service v5

## 🔧 Git Repository File Creation Fix

Scaffolder service v5 includes critical fixes for Git repository creation. Previously, GitHub repositories were created but remained empty. This is now fixed.

## 📋 What Was Fixed

- **Git User Configuration**: Added proper Git user.name and user.email configuration
- **Git Command Compatibility**: Fixed Git commands for Alpine Linux containers
- **Complete File Commit**: All scaffolded files now properly commit to GitHub repositories

## 🚀 Quick Migration

### For Production Kubernetes
```bash
# Update your deployment to use v5 image
# Edit: kubernetes/scaffolder-deployment.yaml or kubernetes/prod-scaffolder-deployment.yaml
# Change: image: YOUR_REGISTRY/scaffolder-service:v21
# To:     image: YOUR_REGISTRY/scaffolder-service:v5

# Apply the update
kubectl apply -f kubernetes/scaffolder-deployment.yaml
kubectl rollout restart deployment/scaffolder-service -n backstage
```

### For Local Development (minikube)
```bash
# The minikube deployment is already updated to v5
kubectl apply -f minikube/scaffolder-deployment.yaml
kubectl rollout restart deployment/scaffolder-service -n backstage
```

## ✅ Verification

Create a new service to verify the fix:
```bash
curl -X POST http://your-scaffolder-service/api/scaffold \
  -H "Content-Type: application/json" \
  -d '{
    "component_id": "test-git-fix",
    "description": "Testing Git repository file creation",
    "owner": "your-team",
    "include_docker": true,
    "include_k8s": true
  }'
```

Check that the GitHub repository contains all files:
- Source code (Java files)
- Build configuration (pom.xml)
- Container definition (Dockerfile)
- Kubernetes manifests (deployment.yaml, service.yaml)
- Documentation (README.md, catalog-info.yaml)

## 🔄 Rollback (if needed)

If you need to rollback to v21:
```bash
# Revert image version in deployment file
# Change back to: image: YOUR_REGISTRY/scaffolder-service:v21

kubectl apply -f kubernetes/scaffolder-deployment.yaml
kubectl rollout restart deployment/scaffolder-service -n backstage
```

## 📊 Impact

- **✅ Fixed**: Empty Git repositories
- **✅ Improved**: Better debugging and error handling
- **✅ Enhanced**: More robust Git operations
- **⚠️ Note**: No breaking changes to API or configuration

## 🎯 Benefits

1. **Complete Repositories**: All scaffolded services now have complete source code in Git
2. **Better Developer Experience**: Developers can immediately clone and work with generated code
3. **CI/CD Ready**: Repositories are ready for automated build and deployment pipelines
4. **Audit Trail**: Complete history of generated code changes