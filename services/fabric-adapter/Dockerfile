FROM node:20-bookworm-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
RUN mkdir -p /var/lib/synapsenet-audit && chown node:node /var/lib/synapsenet-audit
USER node
EXPOSE 3010
CMD ["npm", "start"]
