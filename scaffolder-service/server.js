const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { execSync, exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PROJECTS_DIR = '/projects/scaffolded-projects';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'felipeazv';

// Namespace safety
const FORBIDDEN_NAMESPACES = new Set(['kube-system', 'kube-public', 'kube-node-lease']);

function validateNamespace(ns) {
  if (!ns) return false;
  // Kubernetes namespace regex (DNS-1123)
  if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(ns)) return false;
  if (FORBIDDEN_NAMESPACES.has(ns)) return false;
  return true;
}

// Ensure projects directory exists
if (!fs.existsSync(PROJECTS_DIR)) {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

// Check if GitHub is configured
const GITHUB_ENABLED = !!GITHUB_TOKEN;
if (GITHUB_ENABLED) {
  console.log('[GITHUB] GitHub integration enabled for owner:', GITHUB_OWNER);
  // Configure gh CLI with token
  try {
    execSync(`echo "${GITHUB_TOKEN}" | gh auth login --with-token`, { stdio: 'pipe' });
    console.log('[GITHUB] GitHub CLI authenticated successfully');
  } catch (error) {
    console.error('[GITHUB] Failed to authenticate with GitHub CLI:', error.message);
  }
} else {
  console.warn('[GITHUB] GitHub integration disabled - GITHUB_TOKEN not configured');
}

// Helper function to check if GitHub repo exists
async function checkGitHubRepoExists(repoName) {
  if (!GITHUB_ENABLED) return false;
  
  try {
    await execAsync(`gh repo view ${GITHUB_OWNER}/${repoName}`);
    return true;
  } catch (error) {
    return false;
  }
}

// Helper function to create GitHub repo
async function createGitHubRepo(repoName, description) {
  if (!GITHUB_ENABLED) {
    throw new Error('GitHub integration not configured');
  }
  
  try {
    console.log(`[GITHUB] Creating repository: ${GITHUB_OWNER}/${repoName}`);
    const { stdout } = await execAsync(
      `gh repo create ${GITHUB_OWNER}/${repoName} --public --description "${description}" --clone=false`
    );
    console.log(`[GITHUB] Repository created successfully`);
    return `https://github.com/${GITHUB_OWNER}/${repoName}`;
  } catch (error) {
    console.error('[GITHUB] Failed to create repository:', error.message);
    throw new Error(`Failed to create GitHub repository: ${error.message}`);
  }
}

// Helper function to initialize git and push to GitHub
async function pushToGitHub(projectDir, repoName, commitMessage) {
  if (!GITHUB_ENABLED) {
    console.log('[GITHUB] Skipping git push - GitHub integration disabled');
    return null;
  }
  
  try {
    // Use token in the URL for authentication
    const repoUrl = `https://${GITHUB_TOKEN}@github.com/${GITHUB_OWNER}/${repoName}.git`;
    const publicUrl = `https://github.com/${GITHUB_OWNER}/${repoName}.git`;
    console.log(`[GITHUB] Initializing git in ${projectDir}`);
    
    // Initialize git repo
    execSync('git init', { cwd: projectDir, stdio: 'pipe' });
    execSync('git add .', { cwd: projectDir, stdio: 'pipe' });
    execSync(`git commit -m "${commitMessage}"`, { cwd: projectDir, stdio: 'pipe' });
    
    // Add remote and push
    execSync(`git remote add origin ${repoUrl}`, { cwd: projectDir, stdio: 'pipe' });
    execSync('git branch -M main', { cwd: projectDir, stdio: 'pipe' });
    
    console.log(`[GITHUB] Pushing to ${publicUrl}`);
    execSync(`git push -u origin main`, { 
      cwd: projectDir, 
      stdio: 'pipe'
    });
    
    console.log(`[GITHUB] Successfully pushed to GitHub`);
    return publicUrl;
  } catch (error) {
    console.error('[GITHUB] Failed to push to GitHub:', error.message);
    console.error('[GITHUB] Error details:', error.stderr?.toString() || error.stdout?.toString());
    throw new Error(`Failed to push to GitHub: ${error.message}`);
  }
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
      description: userDescription,
      owner,
      port,
      java_version,
      include_docker,
      include_k8s,
      target_namespace
    } = req.body;

    // Use user description or default
    const description = userDescription || 'A Spring Boot microservice created with Backstage and Scaffolder';

    console.log(`[SCAFFOLD] Creating service: ${component_id}`);

    // Validate input
    if (!component_id || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(component_id)) {
      return res.status(400).json({ 
        error: 'Invalid component_id. Must be lowercase alphanumeric with hyphens.' 
      });
    }

    // Check if GitHub repo already exists (name conflict validation)
    if (GITHUB_ENABLED) {
      const repoExists = await checkGitHubRepoExists(component_id);
      if (repoExists) {
        return res.status(409).json({ 
          error: `GitHub repository ${GITHUB_OWNER}/${component_id} already exists`,
          conflictType: 'github_repo'
        });
      }
    }

    const projectDir = path.join(PROJECTS_DIR, component_id);
    
    if (fs.existsSync(projectDir)) {
      return res.status(409).json({ 
        error: `Project ${component_id} already exists in local storage`,
        conflictType: 'local_directory'
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

    // Persist initial scaffold metadata early so deploy can read namespace even
    // if later steps fail. Validate namespace here.
    const initialMeta = { namespace: null };
    if (target_namespace && target_namespace.trim() !== '') {
      if (!validateNamespace(target_namespace)) {
        return res.status(400).json({ error: `Invalid or forbidden namespace: ${target_namespace}` });
      }
      initialMeta.namespace = target_namespace;
    }
    try {
      const metaPath = path.join(projectDir, 'scaffold-metadata.json');
      fs.writeFileSync(metaPath, JSON.stringify(initialMeta, null, 2));
      const fdInit = fs.openSync(metaPath, 'r');
      fs.fsyncSync(fdInit);
      fs.closeSync(fdInit);
      console.log(`[SCAFFOLD] Wrote initial scaffold metadata to ${metaPath}: ${JSON.stringify(initialMeta)}`);
    } catch (err) {
      console.error('[SCAFFOLD] Failed to write initial scaffold-metadata.json:', err.message);
    }

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
      const deployment = generateK8sDeployment(component_id, owner, port, target_namespace);
      fs.writeFileSync(path.join(k8sDir, 'deployment.yaml'), deployment);

      const service = generateK8sService(component_id, port, target_namespace);
      fs.writeFileSync(path.join(k8sDir, 'service.yaml'), service);
    }

    // Validate and persist scaffold metadata (namespace and other options)
    const meta = { namespace: null };
    if (target_namespace && target_namespace.trim() !== '') {
      if (!validateNamespace(target_namespace)) {
        return res.status(400).json({ error: `Invalid or forbidden namespace: ${target_namespace}` });
      }
      meta.namespace = target_namespace;
    }

    try {
      const metaPath = path.join(projectDir, 'scaffold-metadata.json');
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
      // fsync by re-opening file to ensure write is flushed
      const fd = fs.openSync(metaPath, 'r');
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      console.log(`[SCAFFOLD] Wrote scaffold metadata to ${metaPath}: ${JSON.stringify(meta)}`);
    } catch (err) {
      console.error('[SCAFFOLD] Failed to write scaffold-metadata.json:', err.message);
      // Continue but warn the user in response
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

    // Create GitHub repository and push code
    let githubRepoUrl = null;
    if (GITHUB_ENABLED) {
      try {
        githubRepoUrl = await createGitHubRepo(component_id, description);
        await pushToGitHub(projectDir, component_id, `Initial commit: ${component_id} service scaffolded by Backstage`);
        console.log(`[GITHUB] Code pushed to ${githubRepoUrl}`);
      } catch (error) {
        console.error('[GITHUB] GitHub integration failed:', error.message);
        // Continue without GitHub - don't fail the entire scaffolding
      }
    }

    res.json({
      success: true,
      message: `Service ${component_id} scaffolded successfully`,
      projectPath: projectDir,
      githubRepo: githubRepoUrl,
      files: {
        pom: `${component_id}/pom.xml`,
        dockerfile: include_docker ? `${component_id}/Dockerfile` : null,
        k8s: include_k8s ? [`${component_id}/k8s/deployment.yaml`, `${component_id}/k8s/service.yaml`] : null,
        source: [
          `${component_id}/src/main/java/${packagePath}/${appClassName}.java`,
          `${component_id}/src/main/java/${packagePath}/${controllerClassName}.java`
        ]
      },
      nextSteps: githubRepoUrl ? [
        `git clone ${githubRepoUrl}`,
        `cd ${component_id}`,
        'mvn clean package',
        'docker build -t ' + component_id + ':latest .',
        'minikube image load ' + component_id + ':latest',
        'kubectl apply -f k8s/deployment.yaml',
        'kubectl apply -f k8s/service.yaml',
        `kubectl port-forward svc/${component_id}-service ${port}:${port}`
      ] : [
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

function generateK8sDeployment(serviceName, owner, port, namespace) {
  const nsBlock = namespace ? `  namespace: ${namespace}\n` : '';
  const templateNsBlock = '';
  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${serviceName}
${nsBlock}  labels:
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

function generateK8sService(serviceName, port, namespace) {
  const nsBlock = namespace ? `  namespace: ${namespace}\n` : '';
  return `apiVersion: v1
kind: Service
metadata:
  name: ${serviceName}-service
${nsBlock}  labels:
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
  const githubRepo = GITHUB_ENABLED ? `${GITHUB_OWNER}/${serviceName}` : `${owner}/${serviceName}`;
  return `apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: ${serviceName}
  description: ${description}
  annotations:
    github.com/project-slug: ${githubRepo}
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

// Download endpoint - creates a tar.gz of the project
app.get('/download/:serviceName', async (req, res) => {
  try {
    const { serviceName } = req.params;
    
    if (!serviceName || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(serviceName)) {
      return res.status(400).json({ error: 'Invalid service name' });
    }
    
    const projectDir = path.join(PROJECTS_DIR, serviceName);
    
    if (!fs.existsSync(projectDir)) {
      return res.status(404).json({ error: `Project ${serviceName} not found` });
    }
    
    console.log(`[DOWNLOAD] Creating archive for ${serviceName}`);
    
    // Create tar.gz archive
    const archivePath = path.join('/tmp', `${serviceName}.tar.gz`);
    execSync(`cd "${PROJECTS_DIR}" && tar -czf "${archivePath}" "${serviceName}"`, { stdio: 'pipe' });
    
    res.download(archivePath, `${serviceName}.tar.gz`, (err) => {
      // Clean up temporary file after sending
      if (fs.existsSync(archivePath)) {
        fs.unlinkSync(archivePath);
      }
      
      if (err) {
        console.error('[DOWNLOAD] Error sending file:', err.message);
      } else {
        console.log(`[DOWNLOAD] Successfully sent ${serviceName}.tar.gz`);
      }
    });
    
  } catch (error) {
    console.error('[DOWNLOAD] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Deploy endpoint - deploys the service to Kubernetes with streaming logs
app.get('/api/deploy/:serviceName/stream', async (req, res) => {
  const { serviceName } = req.params;
  const port = req.query.port || 8080;
  
  if (!serviceName || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(serviceName)) {
    return res.status(400).json({ error: 'Invalid service name' });
  }
  
  const projectDir = path.join(PROJECTS_DIR, serviceName);
  
  if (!fs.existsSync(projectDir)) {
    return res.status(404).json({ error: `Project ${serviceName} not found` });
  }
  
  // Set up SSE (Server-Sent Events)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  
  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  
  try {
    sendEvent({ log: `Starting deployment for ${serviceName}...` });
    
    const k8sDir = path.join(projectDir, 'k8s');
    
    if (!fs.existsSync(k8sDir)) {
      sendEvent({ error: 'No k8s directory found. Service was created without Kubernetes manifests.' });
      return res.end();
    }
    
    // Read scaffold metadata for namespace
    let namespace = null;
    try {
      const metaPath = path.join(projectDir, 'scaffold-metadata.json');
      if (fs.existsSync(metaPath)) {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        namespace = meta && meta.namespace ? meta.namespace : null;
      }
    } catch (err) {
      // ignore
    }

    // If namespace is provided, create it idempotently
    if (namespace) {
      sendEvent({ log: `Ensuring namespace '${namespace}' exists...` });
      try {
        execSync(`kubectl create namespace ${namespace} --dry-run=client -o yaml | kubectl apply -f -`, { stdio: 'pipe' });
        sendEvent({ log: `Namespace ${namespace} ensured` });
      } catch (err) {
        sendEvent({ error: `Failed to ensure namespace ${namespace}: ${err.message}` });
        return res.end();
      }
    }

    // If there's a Dockerfile, attempt to build the image so the cluster can pull it
    try {
      const dockerfilePath = path.join(projectDir, 'Dockerfile');
      if (fs.existsSync(dockerfilePath)) {
        sendEvent({ log: 'Dockerfile found — building image locally...' });
        try {
          // Build image using host docker (socket must be mounted)
          const buildCmd = `docker build -t ${serviceName}:latest "${projectDir}"`;
          sendEvent({ log: `Running: ${buildCmd}` });
          const buildOutput = execSync(buildCmd, { encoding: 'utf8', stdio: 'pipe' });
          sendEvent({ log: buildOutput });
          sendEvent({ log: `Docker image ${serviceName}:latest built successfully` });
        } catch (err) {
          sendEvent({ log: `Docker build failed: ${err.message}` });
          // continue — image might be available in registry
        }
      } else {
        sendEvent({ log: 'No Dockerfile present — skipping image build' });
      }
    } catch (err) {
      sendEvent({ log: `Error while checking/building Dockerfile: ${err.message}` });
    }

    // Apply deployment
    sendEvent({ log: 'Applying Kubernetes deployment...' });
    try {
      const nsArg = namespace ? `-n ${namespace}` : '';
      const deployOutput = execSync(`kubectl apply ${nsArg} -f "${path.join(k8sDir, 'deployment.yaml')}"`, { encoding: 'utf8' });
      sendEvent({ log: deployOutput.trim() });
    } catch (error) {
      sendEvent({ error: `Deployment failed: ${error.message}` });
      return res.end();
    }
    
    // Apply service
    sendEvent({ log: 'Applying Kubernetes service...' });
    try {
      const nsArg = namespace ? `-n ${namespace}` : '';
      const svcOutput = execSync(`kubectl apply ${nsArg} -f "${path.join(k8sDir, 'service.yaml')}"`, { encoding: 'utf8' });
      sendEvent({ log: svcOutput.trim() });
    } catch (error) {
      sendEvent({ error: `Service creation failed: ${error.message}` });
      return res.end();
    }
    
    // Wait for pod to be ready
    sendEvent({ log: 'Waiting for pod to be ready...' });
    let attempts = 0;
    const maxAttempts = 30;
    
    while (attempts < maxAttempts) {
      try {
        const nsArg = namespace ? `-n ${namespace}` : '';
        const podStatus = execSync(`kubectl get pods ${nsArg} -l app=${serviceName} -o jsonpath='{.items[0].status.phase}'`, { encoding: 'utf8' });
        sendEvent({ log: `Pod status: ${podStatus}` });
        
        if (podStatus.includes('Running')) {
          sendEvent({ log: '✓ Pod is running!' });
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
      } catch (error) {
        sendEvent({ log: `Waiting for pod... (${attempts}/${maxAttempts})` });
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
      }
    }
    
    if (attempts >= maxAttempts) {
      sendEvent({ error: 'Timeout waiting for pod to start' });
      return res.end();
    }
    
    // Get pod logs
    sendEvent({ log: '\n--- Pod Logs ---' });
    try {
      const nsArg = namespace ? `-n ${namespace}` : '';
      const logs = execSync(`kubectl logs ${nsArg} -l app=${serviceName} --tail=50`, { encoding: 'utf8' });
      sendEvent({ log: logs });
    } catch (error) {
      sendEvent({ log: 'Could not retrieve logs yet' });
    }
    
    // Success
    sendEvent({ 
      success: true,
      log: `\n✓ Deployment complete! Service ${serviceName} is running on port ${port}`,
      serviceName,
      port
    });
    
    res.end();
    
  } catch (error) {
    sendEvent({ error: error.message });
    res.end();
  }
});

// Cleanup single service endpoint
app.delete('/api/cleanup/:serviceName', async (req, res) => {
  const { serviceName } = req.params;
  
  if (!serviceName || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(serviceName)) {
    return res.status(400).json({ error: 'Invalid service name' });
  }
  
  console.log(`[CLEANUP] Starting cleanup for ${serviceName}`);
  const results = {
    serviceName,
    github: { deleted: false, error: null },
    kubernetes: { deployment: false, service: false, error: null },
    localStorage: { deleted: false, error: null }
  };
  
  try {
    // Delete GitHub repository
    if (GITHUB_ENABLED) {
      try {
        await execAsync(`gh repo delete ${GITHUB_OWNER}/${serviceName} --yes`);
        results.github.deleted = true;
        console.log(`[CLEANUP] Deleted GitHub repo: ${GITHUB_OWNER}/${serviceName}`);
      } catch (error) {
        results.github.error = error.message;
        console.log(`[CLEANUP] GitHub deletion failed or repo doesn't exist: ${error.message}`);
      }
    }
    
    // Delete Kubernetes resources (respect namespace if present)
    try {
      let nsArg = '';
      const metaPath = path.join(PROJECTS_DIR, serviceName, 'scaffold-metadata.json');
      if (fs.existsSync(metaPath)) {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        if (meta && meta.namespace) nsArg = `-n ${meta.namespace}`;
      }

      await execAsync(`kubectl delete deployment ${serviceName} ${nsArg} --ignore-not-found=true`);
      results.kubernetes.deployment = true;
      console.log(`[CLEANUP] Deleted K8s deployment: ${serviceName} ${nsArg}`);

      await execAsync(`kubectl delete service ${serviceName}-service ${nsArg} --ignore-not-found=true`);
      results.kubernetes.service = true;
      console.log(`[CLEANUP] Deleted K8s service: ${serviceName}-service ${nsArg}`);
    } catch (error) {
      results.kubernetes.error = error.message;
    }
    
    // Delete local storage
    const projectDir = path.join(PROJECTS_DIR, serviceName);
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
      results.localStorage.deleted = true;
      console.log(`[CLEANUP] Deleted local storage: ${projectDir}`);
    }
    
    res.json({
      success: true,
      message: `Cleaned up service: ${serviceName}`,
      details: results
    });
    
  } catch (error) {
    console.error('[CLEANUP] Error:', error.message);
    res.status(500).json({ 
      error: error.message,
      details: results
    });
  }
});

// Cleanup all services endpoint
app.delete('/api/cleanup-all', async (req, res) => {
  console.log('[CLEANUP-ALL] Starting cleanup of all services');
  const results = {
    servicesFound: [],
    github: { deleted: [], errors: [] },
    kubernetes: { deleted: [], errors: [] },
    localStorage: { deleted: [], errors: [] }
  };
  
  try {
    // Find all services in local storage
    if (fs.existsSync(PROJECTS_DIR)) {
      const services = fs.readdirSync(PROJECTS_DIR).filter(file => {
        const fullPath = path.join(PROJECTS_DIR, file);
        return fs.statSync(fullPath).isDirectory();
      });
      
      results.servicesFound = services;
      console.log(`[CLEANUP-ALL] Found ${services.length} services: ${services.join(', ')}`);
      
      // Delete each service
      for (const serviceName of services) {
        // Delete GitHub repository
        if (GITHUB_ENABLED) {
          try {
            await execAsync(`gh repo delete ${GITHUB_OWNER}/${serviceName} --yes`);
            results.github.deleted.push(serviceName);
            console.log(`[CLEANUP-ALL] Deleted GitHub repo: ${GITHUB_OWNER}/${serviceName}`);
          } catch (error) {
            results.github.errors.push({ service: serviceName, error: error.message });
          }
        }
        
        // Delete Kubernetes resources (respect namespace if present)
        try {
          let nsArg = '';
          const metaPath = path.join(PROJECTS_DIR, serviceName, 'scaffold-metadata.json');
          if (fs.existsSync(metaPath)) {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            if (meta && meta.namespace) nsArg = `-n ${meta.namespace}`;
          }

          await execAsync(`kubectl delete deployment ${serviceName} ${nsArg} --ignore-not-found=true`);
          await execAsync(`kubectl delete service ${serviceName}-service ${nsArg} --ignore-not-found=true`);
          results.kubernetes.deleted.push(serviceName);
          console.log(`[CLEANUP-ALL] Deleted K8s resources: ${serviceName} ${nsArg}`);
        } catch (error) {
          results.kubernetes.errors.push({ service: serviceName, error: error.message });
        }
        
        // Delete local storage
        const projectDir = path.join(PROJECTS_DIR, serviceName);
        try {
          fs.rmSync(projectDir, { recursive: true, force: true });
          results.localStorage.deleted.push(serviceName);
          console.log(`[CLEANUP-ALL] Deleted local storage: ${projectDir}`);
        } catch (error) {
          results.localStorage.errors.push({ service: serviceName, error: error.message });
        }
      }
    }
    
    res.json({
      success: true,
      message: `Cleaned up ${results.servicesFound.length} services`,
      details: results
    });
    
  } catch (error) {
    console.error('[CLEANUP-ALL] Error:', error.message);
    res.status(500).json({ 
      error: error.message,
      details: results
    });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SCAFFOLDER] Service listening on port ${PORT}`);
});
