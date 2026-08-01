# --- SynapseNet/frontend-mobile/Dockerfile ---
# Base image for the React Native mobile frontend development environment/PWA
FROM node:20-slim

WORKDIR /usr/src/app

# Use yarn for dependency management
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .

EXPOSE 8081
CMD [ "yarn", "start" ]