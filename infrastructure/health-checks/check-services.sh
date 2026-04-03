#!/usr/bin/env bash
# Health check script for all ResumeLM microservices
set -euo pipefail

GATEWAY_URL="${GATEWAY_URL:-http://localhost:80}"
AUTH_URL="${AUTH_URL:-http://localhost:8001}"
AI_URL="${AI_URL:-http://localhost:8002}"
RESUME_URL="${RESUME_URL:-http://localhost:8003}"
JOB_URL="${JOB_URL:-http://localhost:8004}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"

PASS=0
FAIL=0

check_health() {
  local name="$1"
  local url="$2"
  local response
  local http_code

  http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${url}" 2>/dev/null || echo "000")

  if [[ "${http_code}" == "200" ]]; then
    echo "✅  ${name}: healthy (${url})"
    PASS=$((PASS + 1))
  else
    echo "❌  ${name}: unhealthy — HTTP ${http_code} (${url})"
    FAIL=$((FAIL + 1))
  fi
}

echo "================================================"
echo "  ResumeLM Services Health Check"
echo "  $(date)"
echo "================================================"
echo ""

check_health "API Gateway"     "${GATEWAY_URL}/health"
check_health "Auth Service"    "${AUTH_URL}/health"
check_health "AI Service"      "${AI_URL}/health"
check_health "Resume Service"  "${RESUME_URL}/health"
check_health "Job Service"     "${JOB_URL}/health"
check_health "Frontend"        "${FRONTEND_URL}/api/health"

echo ""
echo "================================================"
echo "  Results: ${PASS} healthy, ${FAIL} unhealthy"
echo "================================================"

if [[ "${FAIL}" -gt 0 ]]; then
  exit 1
fi
