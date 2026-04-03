FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src/ ./src/
COPY tsconfig.json ./

RUN npm install --include=dev && npm run build && npm prune --omit=dev

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:8006/health || exit 1

USER node

EXPOSE 8006

CMD ["node", "dist/server.js"]
