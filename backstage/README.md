# Backstage Scaffolder Platform

A comprehensive Backstage-based platform for service scaffolding, catalog management, and developer productivity.

## 🏗️ Architecture Overview

This platform provides:
- **Service Scaffolding**: Automated generation of Spring Boot microservices
- **Catalog Management**: PostgreSQL-based catalog for entity storage and discovery
- **Kubernetes Integration**: Production-ready deployments for minikube and Kubernetes
- **Template System**: Reusable templates for consistent service creation
- **Git Integration**: Complete source code repositories with all generated files

## 📁 Project Structure

```
backstage/
├── backstage-app/           # Backstage frontend application
├── kubernetes/              # Production Kubernetes configurations
│   ├── postgres-catalog-deployment.yaml    # Production PostgreSQL catalog
│   ├── scaffolder-deployment.yaml          # Production scaffolder service
│   └── POSTGRES-CATALOG.md                 # PostgreSQL setup guide
├── minikube/               # Local development configurations
│   ├── postgres-deployment.yaml           # Local PostgreSQL catalog
│   └── scaffolder-deployment.yaml         # Local scaffolder service
├── templates/              # Service generation templates
│   ├── spring-boot-base-k8s.yaml         # Base Spring Boot template
│   └── spring-boot-template.yaml         # Enhanced Spring Boot template
└── scaffolder-service/    # Custom scaffolder backend service
    ├── server.js          # Main service implementation
    ├── package.json       # Service dependencies
    └── Dockerfile         # Container image definition
```

## 🚀 Quick Start

### Prerequisites

- **Local Development**: Docker, minikube, kubectl
- **Production**: Kubernetes cluster, kubectl configured
- **Optional**: Backstage CLI for template development

### Local Development (minikube)

1. **Start minikube**
   ```bash
   minikube start
   eval $(minikube docker-env)
   ```

2. **Deploy PostgreSQL catalog** (recommended)
   ```bash
   kubectl apply -f minikube/postgres-deployment.yaml
   ```

3. **Deploy scaffolder service**
   ```bash
   kubectl apply -f minikube/scaffolder-deployment.yaml
   ```

4. **Access services**
   ```bash
   # Get service URLs
   minikube service list
   
   # Access scaffolder service
   minikube service scaffolder-service
   ```

### Production Deployment

1. **Deploy PostgreSQL catalog**
   ```bash
   kubectl apply -f kubernetes/postgres-catalog-deployment.yaml
   ```
   📖 **See [POSTGRES-CATALOG.md](kubernetes/POSTGRES-CATALOG.md)** for detailed PostgreSQL setup

2. **Deploy scaffolder service**
   ```bash
   kubectl apply -f kubernetes/scaffolder-deployment.yaml
   ```

3. **Verify deployment**
   ```bash
   kubectl get pods -n backstage
   kubectl get services -n backstage
   ```

## 🗃️ Catalog Storage

### PostgreSQL (Recommended)
- **Production-ready** persistent storage
- **High-performance** entity queries and relationships
- **Environment parity** across dev/staging/production
- **Advanced features** like audit logging and full-text search

See [kubernetes/POSTGRES-CATALOG.md](kubernetes/POSTGRES-CATALOG.md) for complete setup guide.

### File-based (Fallback)
- **Simple setup** for development
- **No external dependencies**
- **Limited scalability** and persistence

## 🛠️ Service Templates

### Spring Boot Base Template
**Location**: `templates/spring-boot-base-k8s.yaml`

**Features**:
- Java 17 with Spring Boot 3.x
- Maven build configuration
- Kubernetes deployment manifests
- Docker containerization
- Basic REST controller structure

**Usage**:
```bash
curl -X POST http://scaffolder-service/api/scaffold \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-service",
    "description": "My new microservice",
    "owner": "my-team"
  }'
```

### Enhanced Spring Boot Template
**Location**: `templates/spring-boot-template.yaml`

**Additional Features**:
- Database integration (JPA/PostgreSQL)
- Security configuration (JWT)
- Testing framework (JUnit 5)
- API documentation (OpenAPI/Swagger)
- Monitoring and health checks

## 🔧 Service Configuration

### Environment Variables

**Scaffolder Service**:
- `POSTGRES_HOST`: PostgreSQL catalog host (default: postgres-catalog)
- `POSTGRES_PORT`: PostgreSQL port (default: 5432)
- `POSTGRES_DB`: Database name (default: backstage_catalog)
- `POSTGRES_USER`: Database username (from secret)
- `POSTGRES_PASSWORD`: Database password (from secret)
- `PORT`: Service port (default: 3001)

**PostgreSQL Catalog**:
- `POSTGRES_DB`: Catalog database name
- `POSTGRES_USER`: Database user
- `POSTGRES_PASSWORD`: Database password

### Secrets Management

```bash
# Create production secrets
kubectl create secret generic postgres-catalog-credentials \
  --namespace=backstage \
  --from-literal=POSTGRES_DB=backstage_catalog \
  --from-literal=POSTGRES_USER=backstage_prod \
  --from-literal=POSTGRES_PASSWORD=your-secure-password
```

## 📊 API Reference

### Scaffolder Service Endpoints

- **POST /api/scaffold** - Create new service from template
- **GET /api/catalog/entities** - List all catalog entities
- **GET /api/catalog/entities/:ref** - Get specific entity
- **POST /api/catalog/entities** - Register new entity
- **DELETE /api/catalog/entities/:ref** - Delete entity
- **GET /api/catalog/stats** - Get catalog statistics
- **POST /api/cleanup** - Clean up generated services and catalog entries

### Catalog Entity Format

```json
{
  "apiVersion": "backstage.io/v1alpha1",
  "kind": "Component",
  "metadata": {
    "name": "my-service",
    "description": "My new microservice",
    "annotations": {
      "backstage.io/scaffolder": "spring-boot-base-k8s",
      "backstage.io/created-at": "2024-01-01T00:00:00Z"
    }
  },
  "spec": {
    "type": "service",
    "lifecycle": "experimental",
    "owner": "my-team",
    "system": "backend-services"
  }
}
```

## 🔍 Monitoring & Troubleshooting

### Health Checks

```bash
# Scaffolder service health
curl http://scaffolder-service/health

# PostgreSQL catalog health
kubectl exec -n backstage deployment/postgres-catalog -- pg_isready

# Catalog statistics
curl http://scaffolder-service/api/catalog/stats
```

### Common Issues

1. **Service not starting**
   ```bash
   kubectl logs -n backstage -l app=scaffolder-service
   # Check environment variables and secrets
   ```

2. **Database connection issues**
   ```bash
   kubectl logs -n backstage -l app=postgres-catalog
   # Verify PostgreSQL is running and accessible
   ```

3. **Template errors**
   ```bash
   # Check template syntax and required parameters
   curl -X GET http://scaffolder-service/api/templates
   ```

### Debugging Commands

```bash
# Get all resources
kubectl get all -n backstage

# Describe problematic pods
kubectl describe pod -n backstage <pod-name>

# Access scaffolder service logs
kubectl logs -f -n backstage deployment/scaffolder-service

# Connect to PostgreSQL for debugging
kubectl exec -it deployment/postgres-catalog -n backstage -- \
  psql -U backstage -d backstage_catalog
```

## 🚧 Development

### Local Development Setup

1. **Install dependencies**
   ```bash
   cd scaffolder-service
   npm install
   ```

2. **Run locally** (with Docker PostgreSQL)
   ```bash
   docker run -d --name postgres-dev \
     -e POSTGRES_DB=backstage_catalog \
     -e POSTGRES_USER=backstage \
     -e POSTGRES_PASSWORD=password \
     -p 5432:5432 postgres:15
   
   npm start
   ```

3. **Run tests**
   ```bash
   npm test
   ```

### Adding New Templates

1. Create template in `templates/` directory
2. Follow Backstage template schema
3. Test with scaffolder service
4. Update documentation

### Extending the Catalog

The PostgreSQL catalog supports:
- **Custom entity kinds** (Component, System, Domain, etc.)
- **Relationships** between entities
- **Custom metadata** and annotations
- **Search and filtering** capabilities

## 🔐 Security

### Production Security Checklist

- ✅ **Change default passwords** for PostgreSQL
- ✅ **Use Kubernetes secrets** for credentials
- ✅ **Enable network policies** for database access
- ✅ **Run containers as non-root** users
- ⚠️ **Configure TLS/SSL** for production traffic
- ⚠️ **Implement RBAC** for API access
- ⚠️ **Enable audit logging** for compliance

### Network Policies

The PostgreSQL deployment includes NetworkPolicy to restrict access:
- Only pods with label `app: scaffolder-service` can connect
- No external network access to database

## 📈 Performance

### PostgreSQL Optimization

- **Indexes** on frequently queried columns (name, kind, owner)
- **Connection pooling** for high-load scenarios
- **Query optimization** with proper WHERE clauses
- **Regular VACUUM** and statistics updates

### Scaling Considerations

- **Horizontal scaling**: Multiple scaffolder service replicas
- **Database scaling**: PostgreSQL read replicas or clustering
- **Storage scaling**: Monitor and expand PVC as needed
- **Cache layer**: Consider Redis for frequently accessed entities

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

### Code Style

- Follow existing code patterns
- Use meaningful variable names
- Add comments for complex logic
- Update documentation for API changes

## 📝 License

[Add your license information here]

## 📞 Support

- **Issues**: [GitHub Issues](link-to-issues)
- **Documentation**: See individual component README files
- **PostgreSQL Setup**: [kubernetes/POSTGRES-CATALOG.md](kubernetes/POSTGRES-CATALOG.md)