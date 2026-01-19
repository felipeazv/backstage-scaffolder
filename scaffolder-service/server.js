const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { execSync, exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
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
      persistence,
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
    // if later steps fail. Force all services to development namespace.
    const FORCED_TARGET_NAMESPACE = 'development';
    console.log(`[DEBUG] FORCED_TARGET_NAMESPACE value: ${FORCED_TARGET_NAMESPACE}`);
    
    // Validate and override namespace to development
    if (target_namespace && target_namespace !== FORCED_TARGET_NAMESPACE) {
      console.log(`[SCAFFOLD] Warning: Requested namespace '${target_namespace}' overridden to '${FORCED_TARGET_NAMESPACE}'`);
    }
    
    const initialMeta = { 
      namespace: FORCED_TARGET_NAMESPACE,
      owner: owner || 'unknown',
      description: description || 'A Spring Boot microservice generated by Backstage Scaffolder',
      lifecycle: 'production',
      createdAt: new Date().toISOString(),
      port: port || 8080,
      javaVersion: java_version || '21',
    };
    console.log(`[DEBUG] initialMeta.namespace value: ${initialMeta.namespace}`);
    console.log(`[SCAFFOLD] Deploying to namespace: ${FORCED_TARGET_NAMESPACE}`);
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
    const pomXml = generatePomXml(component_id, packageName, java_version, persistence);
    fs.writeFileSync(path.join(projectDir, 'pom.xml'), pomXml);

    // Generate application.properties
    const appProperties = generateApplicationProperties(port, component_id, persistence);
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
    const controllerJava = generateController(packageName, controllerClassName, component_id, persistence);
    fs.writeFileSync(path.join(srcDir, `${controllerClassName}.java`), controllerJava);
    
    // Generate JPA entity and repository if PostgreSQL is enabled
    if (persistence === 'postgresql') {
      const helloWorldEntity = generateHelloWorldEntity(packageName, java_version);
      fs.writeFileSync(path.join(srcDir, 'HelloWorld.java'), helloWorldEntity);
      
      const helloWorldRepository = generateHelloWorldRepository(packageName);
      fs.writeFileSync(path.join(srcDir, 'HelloWorldRepository.java'), helloWorldRepository);
    }

    // Generate Dockerfile
    if (include_docker) {
      const dockerfile = generateDockerfile(component_id, java_version);
      fs.writeFileSync(path.join(projectDir, 'Dockerfile'), dockerfile);
    }

    // Generate K8s manifests
    if (include_k8s) {
      const deployment = generateK8sDeployment(component_id, owner, port, FORCED_TARGET_NAMESPACE, persistence);
      fs.writeFileSync(path.join(k8sDir, 'deployment.yaml'), deployment);

      const service = generateK8sService(component_id, port, FORCED_TARGET_NAMESPACE);
      fs.writeFileSync(path.join(k8sDir, 'service.yaml'), service);
      
      // Generate PostgreSQL resources if persistence is enabled
      if (persistence === 'postgresql') {
        const postgresSecret = generatePostgreSQLSecret(component_id, FORCED_TARGET_NAMESPACE);
        fs.writeFileSync(path.join(k8sDir, 'postgres-secret.yaml'), postgresSecret);
        
        const postgresStatefulSet = generatePostgreSQLStatefulSet(component_id, FORCED_TARGET_NAMESPACE);
        fs.writeFileSync(path.join(k8sDir, 'postgres-statefulset.yaml'), postgresStatefulSet);
        
        const postgresService = generatePostgreSQLService(component_id, FORCED_TARGET_NAMESPACE);
        fs.writeFileSync(path.join(k8sDir, 'postgres-service.yaml'), postgresService);
      }
    }
    
    // Generate Flyway migrations if PostgreSQL is enabled
    if (persistence === 'postgresql') {
      const migrationDir = path.join(resourcesDir, 'db', 'migration');
      fs.mkdirSync(migrationDir, { recursive: true });
      
      // Generate initial schema migration with hello-world table
      const initialMigration = generateInitialMigration();
      fs.writeFileSync(path.join(migrationDir, 'V1__Initial_schema.sql'), initialMigration);
      
      // Generate sample data migration
      const sampleDataMigration = generateSampleDataMigration();
      fs.writeFileSync(path.join(migrationDir, 'V2__Sample_data.sql'), sampleDataMigration);
    }

    // Generate catalog-info.yaml
    const catalogInfo = generateCatalogInfo(component_id, owner, description);
    fs.writeFileSync(path.join(projectDir, 'catalog-info.yaml'), catalogInfo);

    // Generate README
    const readme = generateReadme(component_id, description, port, java_version);
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
        'docker build -t ' + component_id + ':v1 .',
        'minikube image load ' + component_id + ':v1',
        'kubectl apply -f k8s/deployment.yaml',
        'kubectl apply -f k8s/service.yaml',
        `kubectl port-forward svc/${component_id}-service ${port}:${port}`
      ] : [
        `cd ${projectDir}`,
        'mvn clean package',
        'docker build -t ' + component_id + ':v1 .',
        'minikube image load ' + component_id + ':v1',
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

function generatePomXml(serviceName, packageName, javaVersion, persistence = 'none') {
  // Spring Boot 3.x requires Java 17+, use 2.7.x for Java 11
  const springBootVersion = javaVersion === '11' ? '2.7.18' : '3.2.1';
  
  // PostgreSQL dependencies
  const postgresqlDeps = persistence === 'postgresql' ? `
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
        <dependency>
            <groupId>org.postgresql</groupId>
            <artifactId>postgresql</artifactId>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>org.flywaydb</groupId>
            <artifactId>flyway-core</artifactId>
        </dependency>` : '';

  // Flyway Maven plugin for PostgreSQL
  const flywayPlugin = persistence === 'postgresql' ? `
            <plugin>
                <groupId>org.flywaydb</groupId>
                <artifactId>flyway-maven-plugin</artifactId>
                <version>9.22.3</version>
                <configuration>
                    <url>jdbc:postgresql://\${DB_HOST:localhost}:\${DB_PORT:5432}/\${DB_NAME:${serviceName}}</url>
                    <user>\${DB_USER:${serviceName}}</user>
                    <password>\${DB_PASSWORD:password}</password>
                    <locations>
                        <location>classpath:db/migration</location>
                    </locations>
                </configuration>
            </plugin>` : '';
  
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
        <version>${springBootVersion}</version>
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
        </dependency>${postgresqlDeps}
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
            </plugin>${flywayPlugin}
        </plugins>
    </build>
</project>`;
}

function generateApplicationProperties(port, serviceName, persistence = 'none') {
  const baseConfig = `# Server Configuration
server.port=${port}
server.servlet.context-path=/

# Application Information
spring.application.name=${serviceName}
spring.application.display-name=${serviceName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}

# Actuator Configuration
management.endpoints.web.exposure.include=health,info,metrics
management.endpoint.health.show-details=always
management.health.livenessState.enabled=true
management.health.readinessState.enabled=true

# Logging
logging.level.root=INFO
logging.level.com.example=DEBUG`;

  const postgresqlConfig = persistence === 'postgresql' ? `

# PostgreSQL Database Configuration
spring.datasource.url=jdbc:postgresql://\${DB_HOST:${serviceName}-postgres}:\${DB_PORT:5432}/\${DB_NAME:${serviceName}}
spring.datasource.username=\${DB_USER:${serviceName}}
spring.datasource.password=\${DB_PASSWORD:password}
spring.datasource.driver-class-name=org.postgresql.Driver

# JPA Configuration
spring.jpa.hibernate.ddl-auto=validate
spring.jpa.show-sql=false
spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.PostgreSQLDialect
spring.jpa.properties.hibernate.format_sql=true

# Flyway Configuration
spring.flyway.enabled=true
spring.flyway.locations=classpath:db/migration
spring.flyway.baseline-on-migrate=true
spring.flyway.baseline-version=0` : '';

  return baseConfig + postgresqlConfig + '\n';
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

function generateController(packageName, className, serviceName, persistence = 'none') {
  const displayName = serviceName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  
  if (persistence === 'postgresql') {
    return `package ${packageName};

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import java.util.HashMap;
import java.util.Map;
import java.util.List;

@RestController
public class ${className} {

    @Autowired
    private HelloWorldRepository helloWorldRepository;

    @GetMapping("/")
    public Map<String, Object> root() {
        Map<String, Object> response = new HashMap<>();
        response.put("service", "${serviceName}");
        response.put("message", "Welcome to ${displayName} with PostgreSQL!");
        response.put("status", "running");
        response.put("database", "PostgreSQL connected");
        response.put("totalRecords", helloWorldRepository.count());
        return response;
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        Map<String, String> response = new HashMap<>();
        response.put("status", "UP");
        response.put("service", "${serviceName}");
        response.put("database", "PostgreSQL connected");
        return response;
    }

    @GetMapping("/info")
    public Map<String, String> info() {
        Map<String, String> response = new HashMap<>();
        response.put("name", "${serviceName}");
        response.put("version", "1.0.0");
        response.put("description", "${displayName} Service");
        response.put("persistence", "PostgreSQL + Flyway");
        return response;
    }
    
    @GetMapping("/hello-world")
    public List<HelloWorld> getAllHelloWorld() {
        return helloWorldRepository.findAll();
    }
    
    @PostMapping("/hello-world")
    public HelloWorld createHelloWorld(@RequestBody Map<String, String> request) {
        HelloWorld helloWorld = new HelloWorld();
        helloWorld.setNickname(request.get("nickname"));
        return helloWorldRepository.save(helloWorld);
    }

}
`;
  } else {
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
}

function generateDockerfile(serviceName, javaVersion) {
  const baseImage = javaVersion === '11' ? 'maven:3.9-eclipse-temurin-11' : 
                    javaVersion === '17' ? 'maven:3.9-eclipse-temurin-17' :
                    'maven:3.9-eclipse-temurin-21';
  
  // Use standard runtime images for better cross-platform compatibility
  const runtimeImage = `eclipse-temurin:${javaVersion}-jre`;
  
  return `# Build stage
FROM ${baseImage} AS builder
WORKDIR /build
COPY . .
RUN mvn clean package -DskipTests

# Runtime stage
FROM ${runtimeImage}
WORKDIR /app
COPY --from=builder /build/target/*.jar app.jar

# Create spring user (handle existing user gracefully)
RUN (adduser -D -u 1001 spring 2>/dev/null || useradd -r -u 1001 spring 2>/dev/null || true) && \\
    chown -R $(id -u spring):$(id -g spring) /app 2>/dev/null || chown -R 1001:1001 /app

USER 1001
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
`;
}

function generateK8sDeployment(serviceName, owner, port, namespace, persistence = 'none') {
  const nsBlock = namespace ? `  namespace: ${namespace}\n` : '';
  
  // PostgreSQL environment variables
  const postgresEnvVars = persistence === 'postgresql' ? `
        env:
        - name: DB_HOST
          value: "${serviceName}-postgres"
        - name: DB_PORT
          value: "5432"
        - name: DB_NAME
          value: "${serviceName}"
        - name: DB_USER
          valueFrom:
            secretKeyRef:
              name: ${serviceName}-postgres-secret
              key: username
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: ${serviceName}-postgres-secret
              key: password` : '';
  
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
        image: ${serviceName}:v1
        imagePullPolicy: Never
        ports:
        - containerPort: ${port}
          name: http${postgresEnvVars}
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

function generateReadme(serviceName, description, port, java_version) {
  const displayName = serviceName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  
  // Determine Spring Boot version based on Java version
  let springBootVersion;
  if (java_version === '11') {
    springBootVersion = '2.7+';
  } else {
    springBootVersion = '3.2+';
  }
  
  return `# ${displayName}

${description}

## Development

### Prerequisites
- Java ${java_version}+
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
docker build -t ${serviceName}:v1 .
docker run -p ${port}:${port} ${serviceName}:v1
\`\`\`

## Kubernetes Deployment

\`\`\`bash
# Load image to minikube
minikube image load ${serviceName}:v1

# Deploy
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml

# Port forward
kubectl port-forward svc/${serviceName}-service ${port}:${port}
\`\`\`

Access at \`http://localhost:${port}\`

## Architecture

- **Framework**: Spring Boot ${springBootVersion}
- **Language**: Java ${java_version}
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

    // If namespace is provided, optionally ensure it exists. By default we
    // avoid creating namespaces because the scaffolder ServiceAccount may not
    // have cluster-wide rights. Set ALLOW_NAMESPACE_CREATION=true in the
    // deployment to enable automatic creation.
    if (namespace) {
      if (process.env.ALLOW_NAMESPACE_CREATION === 'true') {
        sendEvent({ log: `Ensuring namespace '${namespace}' exists...` });
        try {
          execSync(`kubectl create namespace ${namespace} --dry-run=client -o yaml | kubectl apply -f -`, { stdio: 'pipe' });
          sendEvent({ log: `Namespace ${namespace} ensured` });
        } catch (err) {
          // If we lack RBAC to check/create namespaces, warn and continue —
          // the namespace may already exist (or the cluster admin can create
          // it). Don't abort deployment on Forbidden errors.
          const msg = err && err.message ? err.message : String(err);
          if (msg.includes('Forbidden') || msg.includes('cannot get resource') ) {
            sendEvent({ log: `Namespace ensure skipped due to RBAC: ${msg}` });
          } else {
            sendEvent({ error: `Failed to ensure namespace ${namespace}: ${msg}` });
            return res.end();
          }
        }
      } else {
        sendEvent({ log: `Skipping namespace creation for '${namespace}' (ALLOW_NAMESPACE_CREATION not set). Ensure namespace exists manually.` });
      }
    }

    // If there's a Dockerfile, attempt to build the image so the cluster can pull it
    try {
      const dockerfilePath = path.join(projectDir, 'Dockerfile');
      if (fs.existsSync(dockerfilePath)) {
        sendEvent({ log: 'Dockerfile found — building image locally...' });
        try {
          // Build image using host docker (socket must be mounted)
          const buildCmd = `docker build -t ${serviceName}:v1 "${projectDir}"`;
          sendEvent({ log: `Running: ${buildCmd}` });
          const buildOutput = execSync(buildCmd, { encoding: 'utf8', stdio: 'pipe' });
          sendEvent({ log: buildOutput });
          sendEvent({ log: `Docker image ${serviceName}:v1 built successfully` });

          // Load image into Minikube so it's available for deployment
          sendEvent({ log: `Loading image into Minikube...` });
          const loadCmd = `minikube image load ${serviceName}:v1`;
          sendEvent({ log: `Running: ${loadCmd}` });
          const loadOutput = execSync(loadCmd, { encoding: 'utf8', stdio: 'pipe' });
          sendEvent({ log: loadOutput });
          sendEvent({ log: `Image ${serviceName}:v1 loaded into Minikube successfully` });
        } catch (err) {
          sendEvent({ log: `Docker build or image load failed: ${err.message}` });
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
    
    // First, apply PostgreSQL resources if they exist (in correct order)
    const postgresFiles = [
      'postgres-secret.yaml',
      'postgres-service.yaml', 
      'postgres-statefulset.yaml'
    ];
    
    for (const file of postgresFiles) {
      const filePath = path.join(k8sDir, file);
      if (fs.existsSync(filePath)) {
        sendEvent({ log: `Applying ${file}...` });
        try {
          const nsArg = namespace ? `-n ${namespace}` : '';
          const output = execSync(`kubectl apply ${nsArg} -f "${filePath}"`, { encoding: 'utf8' });
          sendEvent({ log: output.trim() });
        } catch (error) {
          sendEvent({ error: `Failed to apply ${file}: ${error.message}` });
          return res.end();
        }
      }
    }
    
    // If PostgreSQL resources were applied, wait for PostgreSQL to be ready
    const postgresStatefulSetPath = path.join(k8sDir, 'postgres-statefulset.yaml');
    if (fs.existsSync(postgresStatefulSetPath)) {
      sendEvent({ log: 'Waiting for PostgreSQL to be ready...' });
      let pgAttempts = 0;
      const maxPgAttempts = 30;
      
      while (pgAttempts < maxPgAttempts) {
        try {
          const nsArg = namespace ? `-n ${namespace}` : '';
          const pgStatus = execSync(`kubectl get pods ${nsArg} -l app=${serviceName}-postgres -o jsonpath='{.items[0].status.phase}'`, { encoding: 'utf8' });
          sendEvent({ log: `PostgreSQL pod status: ${pgStatus}` });
          
          if (pgStatus.includes('Running')) {
            sendEvent({ log: '✓ PostgreSQL is running!' });
            // Wait additional time for PostgreSQL to be fully ready
            await new Promise(resolve => setTimeout(resolve, 5000));
            break;
          }
          
          await new Promise(resolve => setTimeout(resolve, 3000));
          pgAttempts++;
        } catch (error) {
          sendEvent({ log: `Waiting for PostgreSQL... (${pgAttempts}/${maxPgAttempts})` });
          await new Promise(resolve => setTimeout(resolve, 3000));
          pgAttempts++;
        }
      }
      
      if (pgAttempts >= maxPgAttempts) {
        sendEvent({ error: 'Timeout waiting for PostgreSQL to start' });
        return res.end();
      }
    }
    
    // Now apply the application deployment
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

// List all services endpoint
app.get('/api/list-services', async (req, res) => {
  try {
    const services = [];
    
    // List local project directories
    if (fs.existsSync(PROJECTS_DIR)) {
      const dirs = fs.readdirSync(PROJECTS_DIR);
      
      for (const dir of dirs) {
        const projectPath = path.join(PROJECTS_DIR, dir);
        const metadataPath = path.join(projectPath, 'scaffold-metadata.json');
        const catalogPath = path.join(projectPath, 'catalog-info.yaml');
        
        let metadata = {};
        if (fs.existsSync(metadataPath)) {
          try {
            metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
          } catch (e) {
            console.warn(`Failed to read metadata for ${dir}:`, e.message);
          }
        }
        
        // Check if service exists in Kubernetes
        let hasK8s = false;
        try {
          const nsArg = metadata.namespace ? `-n ${metadata.namespace}` : '';
          execSync(`kubectl get deployment ${nsArg} ${dir}`, { stdio: 'pipe' });
          hasK8s = true;
        } catch (e) {
          // Service not deployed
        }
        
        // Check if Git repo exists
        let hasGit = false;
        let gitUrl = null;
        if (GITHUB_ENABLED) {
          try {
            const result = execSync(`gh repo view ${GITHUB_OWNER}/${dir} --json url`, { encoding: 'utf8' });
            const repoInfo = JSON.parse(result);
            hasGit = true;
            gitUrl = repoInfo.url;
          } catch (e) {
            // Repo doesn't exist
          }
        }
        
        services.push({
          name: dir,
          type: 'service',
          owner: metadata.owner || 'unknown',
          description: metadata.description || 'A Spring Boot microservice',
          lifecycle: metadata.lifecycle || 'production',
          namespace: metadata.namespace || 'default',
          hasK8s,
          hasGit,
          gitUrl,
          createdAt: metadata.createdAt,
        });
      }
    }
    
    res.json({ 
      success: true,
      count: services.length,
      services 
    });
  } catch (error) {
    console.error('[LIST-SERVICES] Error:', error);
    res.status(500).json({ 
      error: error.message,
      services: [] 
    });
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
    kubernetes: { 
      deployment: false, 
      service: false, 
      postgres: { statefulset: false, service: false, secret: false, pvc: false },
      error: null 
    },
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
      } else {
        // Default to development namespace if metadata not found
        nsArg = '-n development';
      }

      // Delete main service resources
      await execAsync(`kubectl delete deployment ${serviceName} ${nsArg} --ignore-not-found=true`);
      results.kubernetes.deployment = true;
      console.log(`[CLEANUP] Deleted K8s deployment: ${serviceName} ${nsArg}`);

      await execAsync(`kubectl delete service ${serviceName}-service ${nsArg} --ignore-not-found=true`);
      results.kubernetes.service = true;
      console.log(`[CLEANUP] Deleted K8s service: ${serviceName}-service ${nsArg}`);
      
      // Delete PostgreSQL resources if they exist
      try {
        await execAsync(`kubectl delete statefulset ${serviceName}-postgres ${nsArg} --ignore-not-found=true`);
        results.kubernetes.postgres.statefulset = true;
        console.log(`[CLEANUP] Deleted PostgreSQL StatefulSet: ${serviceName}-postgres ${nsArg}`);
      } catch (error) {
        console.log(`[CLEANUP] PostgreSQL StatefulSet deletion info: ${error.message}`);
      }
      
      try {
        await execAsync(`kubectl delete service ${serviceName}-postgres ${nsArg} --ignore-not-found=true`);
        results.kubernetes.postgres.service = true;
        console.log(`[CLEANUP] Deleted PostgreSQL Service: ${serviceName}-postgres ${nsArg}`);
      } catch (error) {
        console.log(`[CLEANUP] PostgreSQL Service deletion info: ${error.message}`);
      }
      
      try {
        await execAsync(`kubectl delete secret ${serviceName}-postgres-secret ${nsArg} --ignore-not-found=true`);
        results.kubernetes.postgres.secret = true;
        console.log(`[CLEANUP] Deleted PostgreSQL Secret: ${serviceName}-postgres-secret ${nsArg}`);
      } catch (error) {
        console.log(`[CLEANUP] PostgreSQL Secret deletion info: ${error.message}`);
      }
      
      try {
        // StatefulSet PVCs follow pattern: postgres-storage-{statefulset-name}-{ordinal}
        await execAsync(`kubectl delete pvc postgres-storage-${serviceName}-postgres-0 ${nsArg} --ignore-not-found=true`);
        results.kubernetes.postgres.pvc = true;
        console.log(`[CLEANUP] Deleted PostgreSQL PVC: postgres-storage-${serviceName}-postgres-0 ${nsArg}`);
      } catch (error) {
        console.log(`[CLEANUP] PostgreSQL PVC deletion info: ${error.message}`);
      }
      
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
    kubernetes: { 
      deleted: [], 
      postgres: { deleted: [], errors: [] },
      errors: [] 
    },
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
          } else {
            // Default to development namespace if metadata not found
            nsArg = '-n development';
          }

          // Delete main service resources
          await execAsync(`kubectl delete deployment ${serviceName} ${nsArg} --ignore-not-found=true`);
          await execAsync(`kubectl delete service ${serviceName}-service ${nsArg} --ignore-not-found=true`);
          results.kubernetes.deleted.push(serviceName);
          console.log(`[CLEANUP-ALL] Deleted K8s main resources: ${serviceName} ${nsArg}`);
          
          // Delete PostgreSQL resources if they exist
          const pgResources = [
            `statefulset ${serviceName}-postgres`,
            `service ${serviceName}-postgres`,
            `secret ${serviceName}-postgres-secret`,
            `pvc postgres-storage-${serviceName}-postgres-0`
          ];
          
          let pgDeleted = false;
          for (const resource of pgResources) {
            try {
              await execAsync(`kubectl delete ${resource} ${nsArg} --ignore-not-found=true`);
              pgDeleted = true;
            } catch (error) {
              // Continue with other resources
            }
          }
          
          if (pgDeleted) {
            results.kubernetes.postgres.deleted.push(serviceName);
            console.log(`[CLEANUP-ALL] Deleted PostgreSQL resources: ${serviceName} ${nsArg}`);
          }
          
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

// PostgreSQL Kubernetes Resource Generators
function generatePostgreSQLSecret(serviceName, namespace) {
  const nsBlock = namespace ? `  namespace: ${namespace}\n` : '';
  return `apiVersion: v1
kind: Secret
metadata:
  name: ${serviceName}-postgres-secret
${nsBlock}type: Opaque
data:
  username: ${Buffer.from(serviceName).toString('base64')}
  password: ${Buffer.from('password').toString('base64')}
`;
}

function generatePostgreSQLStatefulSet(serviceName, namespace) {
  const nsBlock = namespace ? `  namespace: ${namespace}\n` : '';
  return `apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: ${serviceName}-postgres
${nsBlock}  labels:
    app: ${serviceName}-postgres
spec:
  serviceName: ${serviceName}-postgres
  replicas: 1
  selector:
    matchLabels:
      app: ${serviceName}-postgres
  template:
    metadata:
      labels:
        app: ${serviceName}-postgres
    spec:
      containers:
      - name: postgres
        image: postgres:15.4
        env:
        - name: POSTGRES_DB
          value: "${serviceName}"
        - name: POSTGRES_USER
          valueFrom:
            secretKeyRef:
              name: ${serviceName}-postgres-secret
              key: username
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: ${serviceName}-postgres-secret
              key: password
        - name: PGDATA
          value: /var/lib/postgresql/data/pgdata
        ports:
        - containerPort: 5432
          name: postgres
        volumeMounts:
        - name: postgres-storage
          mountPath: /var/lib/postgresql/data
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
  volumeClaimTemplates:
  - metadata:
      name: postgres-storage
    spec:
      accessModes:
      - ReadWriteOnce
      resources:
        requests:
          storage: 1Gi
`;
}

function generatePostgreSQLService(serviceName, namespace) {
  const nsBlock = namespace ? `  namespace: ${namespace}\n` : '';
  return `apiVersion: v1
kind: Service
metadata:
  name: ${serviceName}-postgres
${nsBlock}  labels:
    app: ${serviceName}-postgres
spec:
  type: ClusterIP
  ports:
  - port: 5432
    targetPort: 5432
    protocol: TCP
    name: postgres
  selector:
    app: ${serviceName}-postgres
`;
}

// Flyway Migration Generators
function generateInitialMigration() {
  return `-- Initial schema with hello-world table
-- Created: ${new Date().toISOString()}

CREATE TABLE hello_world (
    id BIGSERIAL PRIMARY KEY,
    nickname VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on nickname for faster lookups
CREATE INDEX idx_hello_world_nickname ON hello_world(nickname);

-- Add a trigger to update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_hello_world_updated_at 
    BEFORE UPDATE ON hello_world 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
`;
}

function generateSampleDataMigration() {
  // Fun adjectives and substantives for random nickname generation
  const adjectives = [
    'happy', 'clever', 'brave', 'swift', 'mighty', 'gentle', 'wise', 'bold',
    'bright', 'calm', 'epic', 'free', 'grand', 'noble', 'quick', 'super',
    'wild', 'zesty', 'cosmic', 'magic', 'steel', 'golden', 'silver', 'diamond'
  ];
  
  const substantives = [
    'falcon', 'tiger', 'dragon', 'phoenix', 'eagle', 'wolf', 'lion', 'bear',
    'shark', 'dolphin', 'whale', 'hawk', 'panther', 'cheetah', 'jaguar', 'lynx',
    'turtle', 'rabbit', 'fox', 'deer', 'elk', 'moose', 'bison', 'stallion'
  ];
  
  // Generate 20 random combinations
  let insertStatements = '';
  for (let i = 0; i < 20; i++) {
    const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = substantives[Math.floor(Math.random() * substantives.length)];
    const nickname = `${randomAdj}-${randomNoun}`;
    insertStatements += `INSERT INTO hello_world (nickname) VALUES ('${nickname}');\n`;
  }
  
  return `-- Sample data for hello-world table
-- Created: ${new Date().toISOString()}

${insertStatements}
-- Verify the data
-- SELECT id, nickname, created_at FROM hello_world ORDER BY id;
`;
}

// JPA Entity and Repository Generators
function generateHelloWorldEntity(packageName, javaVersion = '17') {
  // Use javax.persistence for Java 11 (Spring Boot 2.7.x), jakarta.persistence for Java 17+ (Spring Boot 3.x)
  const persistenceImport = javaVersion === '11' ? 'javax.persistence' : 'jakarta.persistence';
  
  return `package ${packageName};

import ${persistenceImport}.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "hello_world")
public class HelloWorld {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(nullable = false, length = 100)
    private String nickname;
    
    @Column(name = "created_at")
    private LocalDateTime createdAt;
    
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
    
    public HelloWorld() {}
    
    public HelloWorld(String nickname) {
        this.nickname = nickname;
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }
    
    // Getters and Setters
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public String getNickname() {
        return nickname;
    }
    
    public void setNickname(String nickname) {
        this.nickname = nickname;
        this.updatedAt = LocalDateTime.now();
    }
    
    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
    
    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
    
    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
    
    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
    
    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }
    
    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
`;
}

function generateHelloWorldRepository(packageName) {
  return `package ${packageName};

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface HelloWorldRepository extends JpaRepository<HelloWorld, Long> {
    
    List<HelloWorld> findByNicknameContainingIgnoreCase(String nickname);
    
    List<HelloWorld> findByOrderByCreatedAtDesc();
}
`;
}

// Root route - API status
app.get('/', (req, res) => {
  res.json({
    service: 'Backstage Scaffolder Service',
    status: 'running',
    version: '1.0.0',
    endpoints: {
      scaffold: 'POST /api/scaffold',
      listServices: 'GET /api/list-services',
      deploy: 'POST /api/deploy',
      cleanup: 'DELETE /api/cleanup/:serviceName',
      cleanupAll: 'DELETE /api/cleanup-all'
    },
    github: GITHUB_ENABLED ? 'enabled' : 'disabled',
    projectsDir: PROJECTS_DIR
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SCAFFOLDER] Service listening on port ${PORT}`);
});
