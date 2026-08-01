# --- SynapseNet/services/api-gateway/Dockerfile ---
# Base image for the Node.js backend API Gateway
FROM node:20-slim

WORKDIR /usr/src/app

# This service is also a Yarn workspace, but its image has an isolated build context.
COPY package.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3001

# Use yarn to start the application
CMD [ "npm", "start" ]
