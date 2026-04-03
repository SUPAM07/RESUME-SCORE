"""
Resume Score — Shared Python Package

Install in Python services using:
    pip install -e ../../packages/python-shared
    # or with Kafka support:
    pip install -e ../../packages/python-shared[kafka]
"""

from resume_score_shared.logging import get_logger
from resume_score_shared.events import EventEnvelope
from resume_score_shared.errors import AppError, ErrorCode

__all__ = ["get_logger", "EventEnvelope", "AppError", "ErrorCode"]
__version__ = "0.1.0"
