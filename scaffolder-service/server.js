const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { execSync, exec } = require('child_process');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PROJECTS_DIR = '/tmp/scaffolded-projects';

// Ensure projects directory exists
if (!fs.existsSync(PROJECTS_DIR)) {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'scaffolder' });
});

// Main scaffolding endpoint
app.post('/api/scaffold', async (req, res) => {
  try {
    const {
      component_id,
      description,
      owner,
      port,
      java_version,
      include_docker,
      include_k8s
    } = req.body;

    console.log(`[SCAFFOLD] Creating service: ${component_id}`);

    // Validate input
    if (!component_id || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(component_id)) {
      return res.status(400).json({ 
        error: 'Invalid component_id. Must be lowercase alphanumeric with hyphens.' 
      });
    }

    const projectDir = path.join(PROJECTS_DIR, component_id);
    
    if (fs.existsSync(projectDir)) {
      return res.status(409).json({ 
        error: `Project ${component_id} already exists` 
      });
    }

    // Create project structure
    const packageName = `com.example.${component_id.replace(/-/g, '')}`;
    const packagePath = packageName.split('.').join('/');
    
    const srcDir = path.join(projectDir, 'src', 'main', 'java', packagePath);
    const resourcesDir = path.join(projectDir, 'src', 'main', 'resources');
    const k8sDir = path.join(projectDir, 'k8s');

    [srcDir, resourcesDir, k8sDir].forEach(dir => {
      fs.mkdirSync(dir, { recursive: true });
    });

    // Generate pom.xml
    const pomXml = generatePomXml(component_id, packageName, java_version);
    fs.writeFileSync(path.join(projectDir, 'pom.xml'), pomXml);

    // Generate application.properties
    const appProperties = generateApplicationProperties(port);
    fs.writeFileSync(path.join(resourcesDir, 'application.properties'), appProperties);

    // Generate Spring Boot Application class
    const appClassName = component_id
      .split('-')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('') + 'Application';
    
    const appJava = generateApplicationClass(packageName, appClassName);
    fs.writeFileSync(path.join(srcDir, `${appClassName}.java`), appJava);

    // Generate REST Controller
    const controllerClassName = appClassName.replace('Application', 'Controller');
    const controllerJava = generateController(packageName, controllerClassName, component_id);
    fs.writeFileSync(path.join(srcDir, `${controllerClassName}.java`), controllerJava);

    // Generate Dockerfile
    if (include_docker) {
      const dockerfile = generateDockerfile(component_id, java_version);
      fs.writeFileSync(path.join(projectDir, 'Dockerfile'), dockerfile);
    }

    // Generate K8s manifests
    if (include_k8s) {
      const deployment = generateK8sDeployment(component_id, owner, port);
      fs.writeFileSync(path.join(k8sDir, 'deployment.yaml'), deployment);

      const service = generateK8sService(component_id, port);
      fs.writeFileSync(path.join(k8sDir, 'service.yaml'), service);
    }

    // Generate catalog-info.yaml
    const catalogInfo = generateCatalogInfo(component_id, owner, description);
    fs.writeFileSync(path.join(projectDir, 'catalog-info.yaml'), catalogInfo);

    // Generate README
    const readme = generateReadme(component_id, description, port);
    fs.writeFileSync(path.join(projectDir, 'README.md'), readme);

    // Generate .gitignore
    const gitignore = generateGitignore();
    fs.writeFileSync(path.join(projectDir, '.gitignore'), gitignore);

    console.log(`[SUCCESS] Project created at ${projectDir}`);

    res.json({
      success: true,
      message: `Service ${component_id} scaffolded successfully`,
      projectPath: projectDir,
      files: {
        pom: `${component_id}/pom.xml`,
        dockerfile: include_docker ? `${component_id}/Dockerfile` : null,
        k8s: include_k8s ? [`${component_id}/k8s/deployment.yaml`, `${component_id}/k8s/service.yaml`] : null,
        source: [
          `${component_id}/src/main/java/${packagePath}/${appClassName}.java`,
          `${component_id}/src/main/java/${packagePath}/${controllerClassName}.java`
        ]
      },
      nextSteps: [
        `cd ${projectDir}`,
        'mvn clean package',
        'docker build -t ' + component_id + ':latest .',
        'minikube image load ' + component_id + ':latest',
        'kubectl apply -f k8s/deployment.yaml',
        'kubectl apply -f k8s/service.yaml',
        `kubectl port-forward svc/${component_id}-service ${port}:${port}`
      ]
    });

  } catch (error) {
    console.error('[ERROR]', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Template generators

function generatePomXml(serviceName, packageName, javaVersion) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.example</groupId>
    <artifactId>${serviceName}</artifactId>
    <version>1.0.0</version>
    <packaging>jar</packaging>

    <name>${serviceName}</name>
    <description>Spring Boot Service</description>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.1</version>
        <relativePath/>
    </parent>

    <properties>
        <java.version>${javaVersion}</java.version>
        <maven.compiler.source>\${java.version}</maven.compiler.source>
        <maven.compiler.target>\${java.version}</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-actuator</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-devtools</artifactId>
            <scope>runtime</scope>
            <optional>true</optional>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
                <configuration>
                    <excludes>
                        <exclude>
                            <groupId>org.springframework.boot</groupId>
                            <artifactId>spring-boot-devtools</artifactId>
                        </exclude>
                    </excludes>
                </configuration>
            </plugin>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <version>3.11.0</version>
                <configuration>
                    <source>\${java.version}</source>
                    <target>\${java.version}</target>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>`;
}

function generateApplicationProperties(port) {
  return `# Server Configuration
server.port=${port}
server.servlet.context-path=/

# Application Information
spring.application.name=spring-boot-service
spring.application.display-name=Spring Boot Service

# Actuator Configuration
management.endpoints.web.exposure.include=health,info,metrics
management.endpoint.health.show-details=always
management.health.livenessState.enabled=true
management.health.readinessState.enabled=true

# Logging
logging.level.root=INFO
logging.level.com.example=DEBUG
`;
}

function generateApplicationClass(packageName, className) {
  return `package ${packageName};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class ${className} {

    public static void main(String[] args) {
        SpringApplication.run(${className}.class, args);
    }

}
`;
}

function generateController(packageName, className, serviceName) {
  const displayName = serviceName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return `package ${packageName};

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.HashMap;
import java.util.Map;

@RestController
public class ${className} {

    @GetMapping("/")
    public Map<String, String> root() {
        Map<String, String> response = new HashMap<>();
        response.put("service", "${serviceName}");
        response.put("message", "Welcome to ${displayName}");
        response.put("status", "running");
        return response;
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        Map<String, String> response = new HashMap<>();
        response.put("status", "UP");
        response.put("service", "${serviceName}");
        return response;
    }

    @GetMapping("/info")
    public Map<String, String> info() {
        Map<String, String> response = new HashMap<>();
        response.put("name", "${serviceName}");
        response.put("version", "1.0.0");
        response.put("description", "${displayName} Service");
        return response;
    }

}
`;
}

function generateDockerfile(serviceName, javaVersion) {
  const baseImage = javaVersion === '11' ? 'maven:3.9.2-eclipse-temurin-11' : 
                    javaVersion === '17' ? 'maven:3.9.2-eclipse-temurin-17' :
                    'maven:3.9.2-eclipse-temurin-21';
  
  return `# Build stage
FROM ${baseImage} AS builder
WORKDIR /build
COPY . .
RUN mvn clean package -DskipTests

# Runtime stage
FROM eclipse-temurin:${javaVersion}-jre-alpine
WORKDIR /app
COPY --from=builder /build/target/*.jar app.jar
RUN adduser -D -u 1000 spring && chown -R spring:spring /app
USER spring
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
`;
}

function generateK8sDeployment(serviceName, owner, port) {
  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${serviceName}
  labels:
    app: ${serviceName}
    owner: ${owner}
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ${serviceName}
  template:
    metadata:
      labels:
        app: ${serviceName}
        owner: ${owner}
    spec:
      containers:
      - name: ${serviceName}
        image: ${serviceName}:latest
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: ${port}
          name: http
        livenessProbe:
          httpGet:
            path: /actuator/health/liveness
            port: ${port}
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
        readinessProbe:
          httpGet:
            path: /actuator/health/readiness
            port: ${port}
          initialDelaySeconds: 15
          periodSeconds: 5
          timeoutSeconds: 3
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
`;
}

function generateK8sService(serviceName, port) {
  return `apiVersion: v1
kind: Service
metadata:
  name: ${serviceName}-service
  labels:
    app: ${serviceName}
spec:
  type: NodePort
  ports:
  - port: ${port}
    targetPort: ${port}
    protocol: TCP
    name: http
  selector:
    app: ${serviceName}
`;
}

function generateCatalogInfo(serviceName, owner, description) {
  return `apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: ${serviceName}
  description: ${description}
  annotations:
    github.com/project-slug: ${owner}/${serviceName}
    backstage.io/kubernetes-label-selector: 'app=${serviceName}'
spec:
  type: service
  owner: ${owner}
  lifecycle: production
  dependsOn: []
  subcomponentOf: null
`;
}

function generateReadme(serviceName, description, port) {
  const displayName = serviceName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return `# ${displayName}

${description}

## Development

### Prerequisites
- Java 21+
- Maven 3.9+
- Docker (optional)
- Kubernetes/minikube (optional)

### Build

\`\`\`bash
mvn clean package
\`\`\`

### Run Locally

\`\`\`bash
mvn spring-boot:run
\`\`\`

Service will be available at \`http://localhost:${port}\`

### API Endpoints

- \`GET /\` - Service information
- \`GET /health\` - Health check
- \`GET /info\` - Service information

## Docker

\`\`\`bash
docker build -t ${serviceName}:latest .
docker run -p ${port}:${port} ${serviceName}:latest
\`\`\`

## Kubernetes Deployment

\`\`\`bash
# Load image to minikube
minikube image load ${serviceName}:latest

# Deploy
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml

# Port forward
kubectl port-forward svc/${serviceName}-service ${port}:${port}
\`\`\`

Access at \`http://localhost:${port}\`

## Architecture

- **Framework**: Spring Boot 3.2+
- **Language**: Java
- **Containerization**: Docker
- **Orchestration**: Kubernetes

## License

MIT
`;
}

function generateGitignore() {
  return `# Maven
target/
.classpath
.project
.settings/
*.jar
*.war
*.ear

# IDE
.idea/
.vscode/
*.swp
*.swo
*~
.DS_Store

# Build
out/
bin/

# Dependencies
node_modules/
.npm

# Environment
.env
.env.local
.env.*.local
`;
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SCAFFOLDER] Service listening on port ${PORT}`);
});
