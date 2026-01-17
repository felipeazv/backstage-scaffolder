FROM node:18-alpine

# Install git and GitHub CLI
RUN apk add --no-cache git github-cli

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
