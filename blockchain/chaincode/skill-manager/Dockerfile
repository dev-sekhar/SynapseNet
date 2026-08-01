FROM node:20-bookworm-slim

WORKDIR /chaincode
COPY package.json ./
RUN npm install --omit=dev
COPY tsconfig.json ./
COPY src ./src
RUN npm install --no-save typescript@5.4.5 \
    && npm run build \
    && npm uninstall typescript

USER node
EXPOSE 9999
CMD ["npm", "run", "start:server"]
