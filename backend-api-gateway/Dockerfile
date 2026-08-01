# --- SynapseNet/backend-api-gateway/Dockerfile ---
# Base image for the Node.js backend API Gateway
FROM node:20-slim

WORKDIR /usr/src/app

# Use yarn for dependency management
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .

EXPOSE 3001

# Use yarn to start the application
CMD [ "yarn", "start" ]
