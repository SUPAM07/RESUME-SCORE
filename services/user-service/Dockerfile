FROM node:20-alpine AS runner
RUN apk add --no-cache dumb-init
WORKDIR /app
COPY . .
RUN npm install -g pnpm@9.15.0
RUN pnpm install --frozen-lockfile --filter @resume-score/user-service
RUN pnpm run --filter @resume-score/user-service build
ENV NODE_ENV=production
EXPOSE 3003
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3003/health', r => r.statusCode === 200 ? process.exit(0) : process.exit(1))"
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "services/user-service/dist/index.js"]
