# ${{ values.component_id }}

${{ values.description }}

## Overview

This Spring Boot microservice was generated using Backstage Scaffolder.

## Running Locally

```bash
./mvnw spring-boot:run
```

The service will be available at `http://localhost:${{ values.port }}`

## Endpoints

- `GET /` - Hello endpoint
- `GET /api/info` - Service information
- `GET /actuator/health` - Health check
- `GET /actuator/info` - Application info

## Building

```bash
./mvnw clean package
```

## Running with Docker

```bash
docker build -t ${{ values.component_id }} .
docker run -p ${{ values.port }}:${{ values.port }} ${{ values.component_id }}
```

## Configuration

- **Port**: ${{ values.port }}
- **Java Version**: ${{ values.java_version }}
- **Spring Boot**: 3.2.1

## Owner

${{ values.owner }}
