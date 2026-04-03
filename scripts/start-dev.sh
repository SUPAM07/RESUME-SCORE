#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# start-dev.sh — Full development environment startup
# Usage: ./scripts/start-dev.sh [--infra-only] [--services-only]
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

INFRA_ONLY=false
SERVICES_ONLY=false

for arg in "$@"; do
  case $arg in
    --infra-only)   INFRA_ONLY=true ;;
    --services-only) SERVICES_ONLY=true ;;
  esac
done

echo ""
echo "╔════════════════════════════════════════╗"
echo "║   Resume Score — Dev Environment       ║"
echo "╚════════════════════════════════════════╝"
echo ""

# ─── Step 1: Infrastructure ───────────────────────────────────────────────────

if [ "$SERVICES_ONLY" = false ]; then
  echo "📦 Starting infrastructure..."
  ./scripts/start-infra.sh
  echo ""
  echo "⏳ Waiting 10s for infrastructure to be ready..."
  sleep 10
fi

if [ "$INFRA_ONLY" = true ]; then
  echo "✅ Infrastructure started. Exiting (--infra-only mode)."
  exit 0
fi

# ─── Step 2: Copy env files if not present ────────────────────────────────────

for service_env in services/*/.env.example; do
  service_dir=$(dirname "$service_env")
  if [ ! -f "$service_dir/.env" ]; then
    cp "$service_env" "$service_dir/.env"
    echo "📝 Created $service_dir/.env from example"
  fi
done

# ─── Step 3: Install dependencies ────────────────────────────────────────────

echo ""
echo "📦 Installing dependencies..."
pnpm install --frozen-lockfile

# ─── Step 4: Build shared packages first ─────────────────────────────────────

echo ""
echo "🔨 Building shared packages..."
pnpm turbo build \
  --filter=@resume-score/common \
  --filter=@resume-score/types \
  --filter=@resume-score/logger \
  --filter=@resume-score/kafka \
  --filter=@resume-score/ai-prompts \
  --filter=@resume-score/database

# ─── Step 5: Run DB migrations ───────────────────────────────────────────────

echo ""
echo "🗄️  Running database migrations..."
pnpm --filter=@resume-score/database db:push || echo "⚠️  DB migration skipped (check DATABASE_URL)"

# ─── Step 6: Start all services ──────────────────────────────────────────────

echo ""
echo "🚀 Starting all services with Turborepo..."
echo ""
echo "   Web app:    http://localhost:3000"
echo "   Gateway:    http://localhost:3001"
echo "   Resume svc: http://localhost:3002"
echo "   User svc:   http://localhost:3003"
echo "   Notify svc: http://localhost:3004"
echo "   Search svc: http://localhost:3005"
echo "   AI svc:     http://localhost:8001/docs"
echo "   Auth svc:   http://localhost:8002/docs"
echo ""

pnpm dev
