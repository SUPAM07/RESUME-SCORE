FROM node:20-alpine AS base

# Install security updates
RUN apk update && apk upgrade && apk add --no-cache dumb-init

# Set working directory
WORKDIR /app

# ─── Dependencies stage ───────────────────────────────────────────────────────
FROM base AS deps

# Copy workspace configs
COPY package.json package-lock.json turbo.json ./
COPY packages/ ./packages/

# Copy service package files
ARG SERVICE_NAME
COPY services/${SERVICE_NAME}/package.json ./services/${SERVICE_NAME}/

# Install dependencies (use legacy-peer-deps for compatibility)
RUN npm install --legacy-peer-deps

# ─── Builder stage ────────────────────────────────────────────────────────────
FROM deps AS builder

# Copy service source
ARG SERVICE_NAME
COPY services/${SERVICE_NAME}/ ./services/${SERVICE_NAME}/

# Build the service
RUN npm run build --workspace=services/${SERVICE_NAME}

# ─── Production stage ─────────────────────────────────────────────────────────
FROM base AS runner

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodeuser

ARG SERVICE_NAME
ENV SERVICE_NAME=${SERVICE_NAME}

WORKDIR /app

# Copy built artifacts and runtime deps
COPY --from=builder --chown=nodeuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodeuser:nodejs /app/services/${SERVICE_NAME}/dist ./dist
COPY --from=builder --chown=nodeuser:nodejs /app/services/${SERVICE_NAME}/package.json ./

USER nodeuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
