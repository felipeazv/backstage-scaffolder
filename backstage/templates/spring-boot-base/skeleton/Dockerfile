FROM eclipse-temurin:${{ values.java_version }}-jdk-alpine AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN apk add --no-cache maven && mvn clean package -DskipTests

FROM eclipse-temurin:${{ values.java_version }}-jre-alpine
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE ${{ values.port }}
ENTRYPOINT ["java", "-jar", "app.jar"]
