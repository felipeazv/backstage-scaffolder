# Scaffolder Service

A Node.js service that generates and deploys Spring Boot microservices to Kubernetes with optional PostgreSQL persistence.

## Features

### Service Generation
- **Multi-version Java Support**: Java 11, 17, and 21
- **Spring Boot Templates**: Complete Maven projects with REST APIs
- **Optional PostgreSQL Integration**: Full database persistence layer
- **Kubernetes Deployment**: Automated service deployment with proper resource allocation

### Database Features (PostgreSQL)
- **Isolated Database Instances**: Each service gets its own PostgreSQL StatefulSet
- **Persistent Storage**: 1GB persistent volumes for data durability
- **Flyway Migrations**: Automatic schema versioning and sample data insertion
- **JPA Integration**: Complete Spring Data JPA setup with repositories
- **Connection Pooling**: HikariCP configuration for optimal performance

### Generated Code Structure

**Basic Service:**
```
src/main/java/com/example/
├── Application.java              # Spring Boot main class
└── controller/
    └── HelloController.java      # Sample REST endpoints
```

**PostgreSQL-Enhanced Service:**
```
src/main/java/com/example/
├── Application.java              # Spring Boot main class
├── controller/
│   ├── HelloController.java      # Basic endpoints
│   └── HelloWorldController.java # Database REST endpoints
├── entity/
│   └── HelloWorld.java          # JPA entity
├── repository/
│   └── HelloWorldRepository.java # Spring Data repository
└── resources/
    ├── application.properties    # Database configuration
    └── db/migration/
        ├── V1__Create_hello_world_table.sql  # Schema creation
        └── V2__Insert_sample_data.sql        # Sample data (20 records)
```

## API Endpoints

### Service Management
- `POST /scaffold` - Create and deploy a new service
- `GET /health` - Service health check

### Generated Service Endpoints
Each generated service includes these REST endpoints:

**Basic Endpoints:**
- `GET /hello` - Simple hello world
- `GET /hello?name=<name>` - Personalized greeting

**PostgreSQL-Enabled Services Add:**
- `GET /api/hello-world` - List all records (paginated)
- `GET /api/hello-world/{id}` - Get specific record
- `POST /api/hello-world` - Create new record
- `PUT /api/hello-world/{id}` - Update record
- `DELETE /api/hello-world/{id}` - Delete record

## Configuration

### Environment Variables
- `GITHUB_TOKEN` - GitHub Personal Access Token for repository creation
- `GITHUB_OWNER` - GitHub username/organization for repositories

### Kubernetes RBAC
The service requires extensive permissions for deployment:

```yaml
- apiGroups: [""]
  resources: ["pods", "services", "secrets", "persistentvolumeclaims"]
  verbs: ["get", "list", "create", "update", "patch", "delete"]
- apiGroups: ["apps"]
  resources: ["deployments", "statefulsets"]
  verbs: ["get", "list", "create", "update", "patch", "delete"]
```

## Database Architecture

### PostgreSQL Deployment Pattern
Each service with PostgreSQL persistence generates:

**StatefulSet Configuration:**
- **Image**: `postgres:14-alpine`
- **Storage**: 1Gi persistent volume claim
- **Database**: Named after the service (e.g., `user-service` database)
- **Credentials**: Stored in Kubernetes secrets
- **Network**: Internal service for database access

**Sample Data Generation:**
- 20 pre-populated records in `hello_world` table
- Random combinations of adjectives + nouns for nicknames
- Examples: "brave-eagle", "clever-fox", "mighty-dragon"

### Connection Configuration
Generated services connect with:
```properties
spring.datasource.url=jdbc:postgresql://<service-name>-postgres-service:5432/<service-name>
spring.datasource.username=postgres
spring.datasource.password=${DB_PASSWORD}
spring.jpa.hibernate.ddl-auto=validate
spring.flyway.enabled=true
```

## Deployment Process

### Service Creation Flow
1. **Validation**: Check for existing GitHub repositories
2. **Code Generation**: Create Spring Boot project with selected features
3. **Database Setup** (if PostgreSQL selected):
   - Deploy PostgreSQL StatefulSet
   - Create persistent volume claim
   - Generate database credentials secret
   - Wait for database readiness
4. **Service Build**: Create Docker image from generated code
5. **Service Deploy**: Deploy to Kubernetes with environment variables
6. **GitHub Integration**: Push code to GitHub repository (if configured)

### Health Checks
The scaffolder implements deployment ordering:
- Database pods must be `Running` before service deployment
- Connection validation before marking deployment complete
- Automatic retry logic for transient failures

## Development

### Running Locally
```bash
npm install
node server.js
```

### Building Docker Image
```bash
docker build -t scaffolder-service:latest .
```

### Testing
```bash
# Test basic service creation
curl -X POST http://localhost:3000/scaffold \
  -H "Content-Type: application/json" \
  -d '{
    "componentId": "test-service",
    "port": "8080",
    "description": "Test service",
    "javaVersion": "17",
    "persistence": "none"
  }'

# Test PostgreSQL service creation
curl -X POST http://localhost:3000/scaffold \
  -H "Content-Type: application/json" \
  -d '{
    "componentId": "db-test-service",
    "port": "8080", 
    "description": "Test with database",
    "javaVersion": "17",
    "persistence": "postgresql"
  }'
```

## Version History

- **v17**: Added PostgreSQL persistence layer with JPA and Flyway
- **v16**: Multi-version Java support (11, 17, 21)
- **v15**: Enhanced Kubernetes deployment with namespace isolation
- **Previous**: Basic Spring Boot scaffolding

## Dependencies

### Runtime
- **Node.js**: 18+
- **kubernetes/client-node**: Kubernetes API client
- **fs-extra**: File system utilities
- **axios**: HTTP client for GitHub API

### Generated Services
- **Spring Boot**: 2.7.x or 3.x (depending on Java version)
- **PostgreSQL Driver**: For database connectivity
- **Spring Data JPA**: Database abstraction
- **Flyway Core**: Database migrations
- **HikariCP**: Connection pooling