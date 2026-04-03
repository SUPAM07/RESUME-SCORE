#!/usr/bin/env bash
# Start all ResumeLM microservices for development
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/docker/docker-compose.microservices.yml"
ENV_FILE="${REPO_ROOT}/.env.microservices"

# ---- Preflight checks ----
if ! command -v docker &>/dev/null; then
  echo "❌ Docker is not installed. Please install Docker first."
  exit 1
fi

if ! docker compose version &>/dev/null 2>&1; then
  echo "❌ Docker Compose v2 is not available. Please upgrade Docker."
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "⚠️  No .env.microservices file found."
  echo "   Copying from .env.microservices.example ..."
  cp "${REPO_ROOT}/.env.microservices.example" "${ENV_FILE}"
  echo "   ✅ Created ${ENV_FILE}"
  echo "   ⚠️  Please fill in the required values before continuing."
  exit 1
fi

echo "================================================"
echo "  Starting ResumeLM Microservices (dev)"
echo "================================================"
echo ""

cd "${REPO_ROOT}"

echo "📦 Building service images..."
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" build --parallel

echo ""
echo "🚀 Starting all services..."
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d

echo ""
echo "⏳ Waiting for services to become healthy..."
sleep 10

echo ""
echo "🏥 Running health checks..."
"${SCRIPT_DIR}/health-check.sh" || true

echo ""
echo "================================================"
echo "  Services are running!"
echo ""
echo "  API Gateway:     http://localhost:80"
echo "  Auth Service:    http://localhost:8001"
echo "  AI Service:      http://localhost:8002"
echo "  Resume Service:  http://localhost:8003"
echo "  Job Service:     http://localhost:8004"
echo "  Frontend:        http://localhost:3000"
echo ""
echo "  View logs:  docker compose -f docker/docker-compose.microservices.yml logs -f"
echo "  Stop:       docker compose -f docker/docker-compose.microservices.yml down"
echo "================================================"
