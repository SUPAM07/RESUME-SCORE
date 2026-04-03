# ResumeLM Architecture

## Overview

ResumeLM uses a microservices architecture deployed behind an Nginx API Gateway. Each service owns its domain and communicates through well-defined HTTP APIs. The existing Next.js monolith continues to serve the web frontend and legacy API routes.

---

## Architecture Diagram

```
                          ┌─────────────────────────────────────────────┐
                          │              Internet / Browser              │
                          └──────────────────┬──────────────────────────┘
                                             │ :80 / :443
                          ┌──────────────────▼──────────────────────────┐
                          │           API Gateway (Nginx)                │
                          │         services/api-gateway/                │
                          │                                              │
                          │  /api/auth/*  → auth-service:8001            │
                          │  /api/ai/*    → ai-service:8002              │
                          │  /api/resumes/* → resume-service:8003        │
                          │  /api/jobs/*  → job-service:8004             │
                          │  /*           → frontend:3000                │
                          └──┬──────┬──────┬──────┬────────┬────────────┘
                             │      │      │      │        │
              ┌──────────────▼─┐ ┌──▼───┐ ┌─────▼──┐ ┌───▼────┐ ┌──────────────┐
              │  Auth Service  │ │  AI  │ │ Resume │ │  Job   │ │  Frontend    │
              │  FastAPI/Python│ │Service│ │Service │ │Service │ │  Next.js 15  │
              │  :8001         │ │:8002  │ │:8003   │ │:8004   │ │  :3000       │
              └──────┬─────────┘ └──┬───┘ └────┬───┘ └───┬────┘ └──────────────┘
                     │              │           │         │
                     │          ┌───▼───┐       │         │
                     │          │ Redis │◄──────┘         │
                     │          │ :6379 │                  │
                     │          └───────┘                  │
                     │         ┌──────────┐                │
                     │         │  Celery  │                │
                     │         │  Worker  │                │
                     │         └──────────┘                │
                     │                                     │
              ┌──────▼─────────────────────────────────────▼───┐
              │                  Supabase                        │
              │     (PostgreSQL + Auth + Row Level Security)     │
              └──────────────────────────────────────────────────┘
```

---

## Services

### API Gateway (`services/api-gateway/`)
- **Technology**: Nginx (Alpine)
- **Port**: 80 (443 in production)
- **Responsibility**: Reverse proxy, rate limiting, CORS, SSL termination
- **Routes**:
  | Path prefix       | Upstream            |
  |-------------------|---------------------|
  | `/api/auth/*`     | auth-service:8001   |
  | `/api/ai/*`       | ai-service:8002     |
  | `/api/resumes/*`  | resume-service:8003 |
  | `/api/jobs/*`     | job-service:8004    |
  | `/*`              | frontend:3000       |

### Auth Service (`services/auth-service/`)
- **Technology**: Python 3.11, FastAPI, Uvicorn
- **Port**: 8001
- **Responsibility**: User registration, login, logout, token validation
- **Backing service**: Supabase Auth (via service role key)

### AI Service (`services/ai-service/`)
- **Technology**: Python 3.11, FastAPI, Celery, Redis
- **Port**: 8002
- **Responsibility**: Async AI processing — resume generation, tailoring, ATS scoring
- **Backing services**: OpenAI / Anthropic API, Redis (broker + result backend)
- **Pattern**: Tasks are queued via Celery. Clients poll `/api/ai/task/{task_id}` for results.

### Resume Service (`services/resume-service/`)
- **Technology**: Node.js 20, Express, TypeScript
- **Port**: 8003
- **Responsibility**: CRUD operations for resumes
- **Backing service**: Supabase PostgreSQL (via service role key + RLS bypass)

### Job Service (`services/job-service/`)
- **Technology**: Node.js 20, Express, TypeScript
- **Port**: 8004
- **Responsibility**: CRUD operations for job listings
- **Backing service**: Supabase PostgreSQL

### Frontend (`src/`)
- **Technology**: Next.js 15, React 19, TypeScript
- **Port**: 3000
- **Responsibility**: Web UI, server-side rendering, existing API routes

---

## API Contracts

### Auth Service

| Method | Path                  | Auth     | Description           |
|--------|-----------------------|----------|-----------------------|
| POST   | `/api/auth/register`  | None     | Register a new user   |
| POST   | `/api/auth/login`     | None     | Login, get JWT token  |
| POST   | `/api/auth/logout`    | Bearer   | Invalidate session    |
| GET    | `/api/auth/me`        | Bearer   | Get current user info |
| GET    | `/health`             | None     | Health check          |

**Register / Login request body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "full_name": "Jane Doe"   // register only
}
```

**Auth response:**
```json
{
  "access_token": "<jwt>",
  "token_type": "bearer",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "Jane Doe",
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

---

### AI Service

| Method | Path                        | Auth   | Description                       |
|--------|-----------------------------|--------|-----------------------------------|
| POST   | `/api/ai/generate-resume`   | Bearer | Queue resume generation task      |
| POST   | `/api/ai/tailor-resume`     | Bearer | Queue resume tailoring task       |
| POST   | `/api/ai/score-resume`      | Bearer | Queue ATS scoring task            |
| GET    | `/api/ai/task/{task_id}`    | Bearer | Poll task status / retrieve result|
| GET    | `/health`                   | None   | Health check                      |

**Task response (202 Accepted):**
```json
{
  "task_id": "celery-task-uuid",
  "status": "queued",
  "message": "Resume generation started"
}
```

**Task status response:**
```json
{
  "task_id": "celery-task-uuid",
  "status": "completed",   // pending | in_progress | completed | failed
  "result": { ... }
}
```

---

### Resume Service

| Method | Path                | Auth   | Description         |
|--------|---------------------|--------|---------------------|
| GET    | `/api/resumes`      | Bearer | List user's resumes |
| POST   | `/api/resumes`      | Bearer | Create resume       |
| GET    | `/api/resumes/:id`  | Bearer | Get single resume   |
| PUT    | `/api/resumes/:id`  | Bearer | Update resume       |
| DELETE | `/api/resumes/:id`  | Bearer | Delete resume       |
| GET    | `/health`           | None   | Health check        |

---

### Job Service

| Method | Path              | Auth   | Description      |
|--------|-------------------|--------|------------------|
| GET    | `/api/jobs`       | Bearer | List user's jobs |
| POST   | `/api/jobs`       | Bearer | Create job       |
| GET    | `/api/jobs/:id`   | Bearer | Get single job   |
| PUT    | `/api/jobs/:id`   | Bearer | Update job       |
| DELETE | `/api/jobs/:id`   | Bearer | Delete job       |
| GET    | `/health`         | None   | Health check     |

---

## Running Locally

### Prerequisites
- Docker 24+ with Docker Compose v2
- All environment variables configured

### 1. Configure environment

```bash
cp .env.microservices.example .env.microservices
# Edit .env.microservices and fill in your values
```

### 2. Start all services (development)

```bash
./scripts/start-dev.sh
```

This will:
1. Build all service images in parallel
2. Start all containers
3. Run health checks

### 3. Verify services are healthy

```bash
./scripts/health-check.sh
```

### 4. View logs

```bash
# All services
docker compose -f docker/docker-compose.microservices.yml logs -f

# Single service
docker compose -f docker/docker-compose.microservices.yml logs -f auth-service
```

### 5. Stop all services

```bash
docker compose -f docker/docker-compose.microservices.yml down
```

### Running individual services without Docker

**Python services (auth / ai):**
```bash
cd services/auth-service
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

**Node.js services (resume / job):**
```bash
cd services/resume-service
npm install
npm run dev
```

---

## Deploying to Production

### 1. Configure environment

```bash
cp .env.microservices.example .env.microservices
# Set all production values including REDIS_PASSWORD
```

### 2. Start production stack

```bash
./scripts/start-prod.sh
```

The production compose file (`docker/docker-compose.prod.yml`) adds:
- Resource limits and reservations per service
- Multiple replicas for stateless services
- `restart: always` policies
- Structured JSON logging
- Redis password authentication

### 3. Database migrations

Run migrations against your Supabase project:

```bash
# Initial schema (first deploy only)
psql "$DATABASE_URL" -f infrastructure/migrations/001_initial_schema.sql

# Performance indexes
psql "$DATABASE_URL" -f infrastructure/migrations/002_add_indexes.sql
```

---

## Infrastructure

```
infrastructure/
├── migrations/
│   ├── 001_initial_schema.sql   — Full database schema
│   └── 002_add_indexes.sql      — Performance indexes
└── health-checks/
    └── check-services.sh        — Curl-based health check script

docker/
├── docker-compose.yml                — Existing monolith compose (unchanged)
├── docker-compose.microservices.yml  — Development microservices compose
└── docker-compose.prod.yml           — Production microservices compose

scripts/
├── start-dev.sh      — Start all services (dev)
├── start-prod.sh     — Start all services (prod)
└── health-check.sh   — Check health endpoints
```

---

## Observability

### Running the observability stack

```bash
docker compose \
  -f docker/docker-compose.microservices.yml \
  -f docker/docker-compose.observability.yml \
  up -d
```

| Tool       | URL                     | Purpose                         |
|------------|-------------------------|---------------------------------|
| Jaeger     | http://localhost:16686  | Distributed trace visualisation |
| Prometheus | http://localhost:9090   | Metrics scraping & alerting     |
| Grafana    | http://localhost:3001   | Dashboards (admin/admin)        |
| Loki       | http://localhost:3100   | Log aggregation                 |

### Correlation IDs

Every request entering the system is assigned a `X-Request-ID` header.  The
API Gateway generates one if the client does not supply it and propagates it to
every upstream service.  All services echo it back in the response header and
include it in every log line, enabling end-to-end trace correlation without a
full distributed tracing infrastructure.

### Distributed tracing

Each service initialises the OpenTelemetry SDK on startup.  Spans are exported
via OTLP HTTP to Jaeger.  Set `ENABLE_TRACING=false` to disable tracing without
code changes.

### Prometheus metrics

All services expose `GET /metrics` in Prometheus text format.  The default
scrape interval is 15 s.  Key metrics:

| Metric | Type | Description |
|--------|------|-------------|
| `http_requests_total` | Counter | Requests by service/method/route/status |
| `http_request_duration_seconds` | Histogram | Request latency buckets |
| `process_uptime_seconds` | Gauge | Service uptime |

---

## Resilience Patterns

Resilience helpers live in `services/shared/middleware/resilience.ts` and are
opt-in.  They are activated via environment variables:

| Pattern | Env var | Default |
|---------|---------|---------|
| Circuit breaker | `ENABLE_CIRCUIT_BREAKER` | false |
| Request timeout | per-call `withTimeout()` | — |
| Retry w/ jitter | per-call `withRetry()` | — |

### Circuit breaker states

```
CLOSED ──(failures >= threshold)──► OPEN ──(reset timeout)──► HALF_OPEN
  ▲                                                                 │
  └───────────────(success >= successThreshold)────────────────────┘
```

---

## Event-Driven Architecture

Domain events are published via `infrastructure/events/publisher.ts`.  The
publisher is a no-op in development unless `ENABLE_EVENTS=true` and
`MESSAGE_BROKER_URL` are set.

### Event envelope

```json
{
  "id":            "<uuid v4>",
  "type":          "resume.created",
  "source":        "resume-service",
  "version":       "1.0",
  "timestamp":     "2024-01-01T00:00:00.000Z",
  "correlationId": "<request-id>",
  "data":          { ... }
}
```

### Running the HA + events stack

```bash
docker compose \
  -f docker/docker-compose.microservices.yml \
  -f docker/docker-compose.ha.yml \
  up -d
```

Access the RabbitMQ management UI at http://localhost:15672.

---

## Saga Pattern

Long-running, multi-service workflows use the orchestrating saga pattern
(`infrastructure/sagas/saga.ts`).  Each step declares an `execute` function and
a `compensate` function.  If any step fails, all previously completed steps are
compensated in reverse order to maintain data consistency.

Example: *Create Resume → Queue AI Scoring*

```
Step 1  execute: createResume()       compensate: deleteResume()
Step 2  execute: queueAiScore()       compensate: cancelAiTask() [best-effort]
```

---

## API Versioning

The Nginx gateway routes both unversioned (`/api/auth/`) and versioned
(`/api/v1/auth/`) paths to the same upstream backends.  This allows gradual
client migration.  A future `/api/v2/` can be added with separate upstream
blocks for non-backwards-compatible changes.

### Deprecation headers

When a version is deprecated, services should include:

```
X-API-Deprecated: true
X-API-Sunset: 2025-06-01
```

---

## High Availability

Use `docker-compose.ha.yml` in conjunction with the base compose to add:

- **Redis Sentinel** (3 nodes, quorum=2) — automatic primary failover
- **Redis replica** — read scaling and standby
- **RabbitMQ** — persistent message broker for async service communication

```bash
docker compose \
  -f docker/docker-compose.microservices.yml \
  -f docker/docker-compose.ha.yml \
  up -d
```

### Infrastructure layout (full stack)

```
infrastructure/
├── migrations/           — Database schema migrations
│   ├── 001_initial_schema.sql
│   ├── 002_add_indexes.sql
│   └── 003_add_rls_policies.sql  — Proper RLS policies (no service-role bypass)
├── health-checks/        — Curl health check scripts
├── observability/        — Prometheus, Loki, Grafana configs
├── ha/                   — Redis Sentinel configuration
├── events/               — Domain event schemas and publisher
├── sagas/                — Distributed transaction saga executor
└── secrets/              — Secrets management templates (never commit real values)
```

---

## Service-to-Service Security

### JWT-based service tokens

When `SERVICE_AUTH_ENABLED=true`, each service must include a short-lived
signed JWT in the `Authorization: Bearer <token>` header of all outbound
service-to-service requests.  The token is signed with `SERVICE_AUTH_SECRET`
and verified by `requireAuth` from `services/shared/middleware/auth.ts`.

### Mutual TLS (mTLS)

For environments requiring full mTLS, set `ENABLE_MTLS=true` and provision
per-service certificates.  A service mesh (Istio, Linkerd) or a certificate
manager (cert-manager on Kubernetes) handles certificate issuance and rotation.

---

## Data Consistency & Security

### Row Level Security

All application tables (`profiles`, `resumes`, `jobs`, `subscriptions`) have
RLS enabled.  Migration `003_add_rls_policies.sql` defines per-table policies
so that authenticated users can only access their own rows.

Services should authenticate as the calling user (using the Supabase anon key
+ user JWT) rather than using the service role key (which bypasses RLS) wherever
possible.

### Audit log

The `audit_log` table captures every INSERT, UPDATE, and DELETE on `resumes`
and `jobs`, recording the user who made the change and a snapshot of old/new
data.  The audit trail is only readable by admins via the service role.

---

## Shared Library (`services/shared/`)

The `@resume-lm/shared` package provides ready-to-use production utilities:

| Module | Description |
|--------|-------------|
| `middleware/auth` | JWT verification middleware for Express services |
| `middleware/resilience` | Circuit breaker, retry, timeout helpers |
| `observability/tracing` | OpenTelemetry SDK initialisation (Node.js) |
| `observability/metrics` | Prometheus text-format metrics middleware |
| `utils/logger` | Structured Winston logger with request-ID propagation |
| `utils/correlation-id` | AsyncLocalStorage-based correlation ID for request tracing |
| `utils/errors` | Typed error hierarchy + Express error handler |
| `types` | Canonical TypeScript domain types |
| `contracts/api` | Request / response type contracts for all services |

---

## Further Reading

| Guide | Path |
|-------|------|
| Improvements overview | `.docs/IMPROVEMENTS.md` |
| Observability setup | `.docs/OBSERVABILITY.md` |
| Resilience patterns | `.docs/RESILIENCE.md` |
| Security best practices | `.docs/SECURITY.md` |
| Event-driven architecture | `.docs/EVENTS.md` |
| Production deployment | `.docs/DEPLOYMENT.md` |
| Troubleshooting | `.docs/TROUBLESHOOTING.md` |
