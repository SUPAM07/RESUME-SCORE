#!/usr/bin/env bash
# Start all ResumeLM microservices for production
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/docker/docker-compose.prod.yml"
ENV_FILE="${REPO_ROOT}/.env.microservices"

# ---- Preflight checks ----
if ! command -v docker &>/dev/null; then
  echo "❌ Docker is not installed."
  exit 1
fi

if ! docker compose version &>/dev/null 2>&1; then
  echo "❌ Docker Compose v2 is not available."
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "❌ Missing ${ENV_FILE}. Please create it from .env.microservices.example."
  exit 1
fi

# Validate required production env vars
REQUIRED_VARS=(
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  REDIS_PASSWORD
)

source "${ENV_FILE}"

for var in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    echo "❌ Required environment variable '${var}' is not set in ${ENV_FILE}."
    exit 1
  fi
done

echo "================================================"
echo "  Starting ResumeLM Microservices (production)"
echo "================================================"
echo ""

cd "${REPO_ROOT}"

echo "📦 Building production images..."
# Use --no-cache when FORCE_REBUILD=1 to allow leveraging Docker layer cache on normal deploys
if [[ "${FORCE_REBUILD:-0}" == "1" ]]; then
  docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" build --parallel --no-cache
else
  docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" build --parallel
fi

echo ""
echo "🚀 Starting all services in production mode..."
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d

echo ""
echo "⏳ Waiting for services to become healthy (60s)..."
sleep 60

echo ""
echo "🏥 Running health checks..."
"${SCRIPT_DIR}/health-check.sh" || {
  echo "⚠️  Some services may not be healthy yet. Check logs with:"
  echo "   docker compose -f docker/docker-compose.prod.yml logs"
}

echo ""
echo "================================================"
echo "  Production services started."
echo ""
echo "  View logs:  docker compose -f docker/docker-compose.prod.yml logs -f"
echo "  Stop:       docker compose -f docker/docker-compose.prod.yml down"
echo "================================================"
