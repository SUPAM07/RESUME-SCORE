FROM node:20-alpine AS runner
RUN apk add --no-cache dumb-init
WORKDIR /app
COPY . .
RUN npm install -g pnpm@9.15.0
RUN pnpm install --frozen-lockfile --filter @resume-score/search-service
RUN pnpm run --filter @resume-score/search-service build
ENV NODE_ENV=production
EXPOSE 3005
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3005/health', r => r.statusCode === 200 ? process.exit(0) : process.exit(1))"
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "services/search-service/dist/index.js"]
