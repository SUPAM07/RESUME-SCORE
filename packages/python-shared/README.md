# resume-score-shared (Python)

Shared Python utilities for all Resume Score microservices. The Python equivalent of the `packages/` TypeScript workspace packages.

## What's Inside

| Module | Description |
|---|---|
| `resume_score_shared.logging` | Structured `structlog` logger (JSON in prod, colors in dev) |
| `resume_score_shared.events` | Pydantic `EventEnvelope[T]` — mirrors TS `EventEnvelope<T>` |
| `resume_score_shared.errors` | `AppError`, `ErrorCode` — mirrors TS `AppError` |

## Installation

In any Python service (`auth-service`, `ai-service`, etc.), add to `requirements.txt`:

```
# For local development (editable install)
-e ../../packages/python-shared

# With Kafka support
-e ../../packages/python-shared[kafka]

# With Redis support
-e ../../packages/python-shared[redis]
```

## Usage

```python
from resume_score_shared import get_logger, EventEnvelope, AppError, ErrorCode

# Structured logging
logger = get_logger("ai-service", request_id="abc-123")
logger.info("Analysis started", resume_id="r-456")

# Create a typed event
from resume_score_shared.events import AIAnalysisRequestedData

event = EventEnvelope.create(
    event_type="ai.analysis.requested",
    aggregate_id=resume_id,
    aggregate_type="Resume",
    data=AIAnalysisRequestedData(
        resume_id=resume_id,
        user_id=user_id,
        resume_text=text,
    ),
    producer_service="resume-service",
)

# Raise typed errors
raise AppError("Resume not found", code=ErrorCode.NOT_FOUND, status_code=404)
```

## Development

```bash
cd packages/python-shared
pip install -e ".[dev]"
pytest
mypy resume_score_shared/
ruff check .
```
