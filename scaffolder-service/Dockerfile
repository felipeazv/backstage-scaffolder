FROM node:18-alpine

# Install git, GitHub CLI, and kubectl
RUN apk add --no-cache git github-cli curl && \
    curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && \
    chmod +x kubectl && \
    mv kubectl /usr/local/bin/

# Configure git
RUN git config --global user.name "Scaffolder Service" && \
    git config --global user.email "scaffolder@backstage.local" && \
    git config --global init.defaultBranch main

WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .

# Create projects directory
RUN mkdir -p /projects/scaffolded-projects

EXPOSE 3000
CMD ["npm", "start"]
