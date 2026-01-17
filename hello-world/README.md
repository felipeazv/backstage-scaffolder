# Spring Boot Hello World

A simple Hello World application built with Spring Boot and Java.

## Prerequisites

- Java 21 or higher
- Maven 3.6+ (or use the Maven wrapper)
- Docker (optional, for containerized deployment)

## Running the Application

### Using Maven

```bash
mvn spring-boot:run
```

### Using Java directly

First, build the application:

```bash
mvn clean package
```

Then run the JAR:

```bash
java -jar target/hello-world-1.0.0.jar
```

## Testing the Application

Once the application is running, you can test it by:

1. Visit `http://localhost:9999/hello` in your browser
2. Visit `http://localhost:9999/hello?name=YourName` to customize the greeting
3. Visit `http://localhost:9999/` for the home page

Or use curl:

```bash
curl http://localhost:9999/hello
curl http://localhost:9999/hello?name=Alice
```

## Project Structure

```
.
├── pom.xml
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── k8s-deployment.yaml
├── k8s-service.yaml
├── src
│   ├── main
│   │   ├── java
│   │   │   └── com
│   │   │       └── example
│   │   │           └── helloworld
│   │   │               ├── HelloWorldApplication.java
│   │   │               └── HelloWorldController.java
│   │   └── resources
│   │       └── application.properties
│   └── test
└── README.md
```

## Running with Docker

### Build the Docker Image

```bash
docker build -t hello-world:latest .
```

### Run the Container

```bash
docker run -d -p 9999:9999 --name spring-boot-hello-world hello-world:latest
```

### Using Docker Compose

```bash
docker-compose up -d
```

### Stop the Container

```bash
docker stop spring-boot-hello-world
docker rm spring-boot-hello-world
```

Or with Docker Compose:

```bash
docker-compose down
```

## Deploying to Kubernetes (Minikube)

### Prerequisites

- Minikube installed and running
- Docker image built (`hello-world:latest`)

### Steps

1. **Load the Docker image into minikube:**
   ```bash
   minikube image load hello-world:latest
   ```

2. **Deploy the application:**
   ```bash
   minikube kubectl -- apply -f k8s-deployment.yaml
   minikube kubectl -- apply -f k8s-service.yaml
   ```

3. **Check deployment status:**
   ```bash
   minikube kubectl -- get pods -l app=hello-world
   minikube kubectl -- get service hello-world-service
   ```

4. **Access the service:**

   **Option 1: Port forwarding (access on localhost:9999)**
   ```bash
   minikube kubectl -- port-forward service/hello-world-service 9999:9999
   ```
   Then visit: `http://localhost:9999/hello`

   **Option 2: Using minikube service**
   ```bash
   minikube service hello-world-service
   ```

   **Option 3: Direct NodePort access**
   ```bash
   minikube service hello-world-service --url
   ```
   Then use the provided URL (typically includes NodePort 30999)

### Cleanup

```bash
minikube kubectl -- delete -f k8s-deployment.yaml
minikube kubectl -- delete -f k8s-service.yaml
```

