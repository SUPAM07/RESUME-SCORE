#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# start-infra.sh — Start all infrastructure dependencies (Kafka, Redis, Postgres)
# Usage: ./scripts/start-infra.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

COMPOSE_FILE="infra/docker/docker-compose.yml"
SERVICES="postgres redis kafka zookeeper qdrant"

echo "🚀 Starting Resume Score infrastructure..."
echo ""

# Check docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker Desktop first."
  exit 1
fi

# Start infrastructure services
docker compose -f "$COMPOSE_FILE" up -d $SERVICES

echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 5

# Check Kafka
if docker compose -f "$COMPOSE_FILE" ps kafka | grep -q "healthy"; then
  echo "✅ Kafka is ready"
else
  echo "⚠️  Kafka is starting up (may take 30s)..."
fi

# Check Postgres
if docker compose -f "$COMPOSE_FILE" ps postgres | grep -q "healthy"; then
  echo "✅ PostgreSQL is ready"
else
  echo "⚠️  PostgreSQL is starting up..."
fi

# Check Redis
if docker compose -f "$COMPOSE_FILE" ps redis | grep -q "healthy"; then
  echo "✅ Redis is ready"
else
  echo "⚠️  Redis is starting up..."
fi

echo ""
echo "📋 Service URLs:"
echo "   PostgreSQL: postgresql://localhost:5432/resume_score"
echo "   Redis:      redis://localhost:6379"
echo "   Kafka:      localhost:9092"
echo "   Qdrant UI:  http://localhost:6333/dashboard"
echo ""
echo "✨ Infrastructure is starting! Run 'pnpm dev' to start all services."
