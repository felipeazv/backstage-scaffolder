# Multi-stage build for Spring Boot application

# Stage 1: Build the application
FROM eclipse-temurin:21-jdk AS builder
WORKDIR /app

# Install Maven
RUN apt-get update && \
    apt-get install -y maven && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy pom.xml first (for better layer caching)
COPY pom.xml .

# Download dependencies (this layer will be cached if pom.xml doesn't change)
RUN mvn dependency:go-offline -B

# Copy source code
COPY src ./src

# Build the application
RUN mvn clean package -DskipTests

# Stage 2: Run the application
FROM eclipse-temurin:21-jre
WORKDIR /app

# Install wget for healthcheck
RUN apt-get update && \
    apt-get install -y wget && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create a non-root user
RUN groupadd -r spring && useradd -r -g spring spring

# Copy the JAR from builder stage
COPY --from=builder /app/target/hello-world-1.0.0.jar app.jar

# Change ownership
RUN chown spring:spring app.jar

# Switch to non-root user
USER spring:spring

# Expose port
EXPOSE 9999

# Health check (using wget which is more commonly available, or we can use Java's built-in tools)
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:9999/hello || exit 1

# Run the application
ENTRYPOINT ["java", "-jar", "app.jar"]
