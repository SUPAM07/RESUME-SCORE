"""
Application error types shared across all Python microservices.
Mirrors packages/common/src/index.ts AppError.
"""
from enum import StrEnum
from typing import Any


class ErrorCode(StrEnum):
    # Auth
    UNAUTHORIZED = "AUTH_001"
    FORBIDDEN = "AUTH_002"
    TOKEN_EXPIRED = "AUTH_003"
    INVALID_TOKEN = "AUTH_004"

    # Validation
    VALIDATION_ERROR = "VAL_001"
    MISSING_REQUIRED_FIELD = "VAL_002"
    INVALID_FORMAT = "VAL_003"

    # Resources
    NOT_FOUND = "RES_001"
    ALREADY_EXISTS = "RES_002"
    CONFLICT = "RES_003"

    # AI
    AI_SERVICE_UNAVAILABLE = "AI_001"
    AI_QUOTA_EXCEEDED = "AI_002"
    AI_PARSING_FAILED = "AI_003"
    AI_ANALYSIS_FAILED = "AI_004"

    # File
    FILE_TOO_LARGE = "FILE_001"
    UNSUPPORTED_FILE_TYPE = "FILE_002"
    FILE_UPLOAD_FAILED = "FILE_003"

    # System
    INTERNAL_SERVER_ERROR = "SYS_001"
    SERVICE_UNAVAILABLE = "SYS_002"
    RATE_LIMIT_EXCEEDED = "SYS_003"
    TIMEOUT = "SYS_004"


class AppError(Exception):
    """
    Operational application error.
    Mirrors the TypeScript AppError in packages/common/src/index.ts.
    """

    def __init__(
        self,
        message: str,
        code: ErrorCode = ErrorCode.INTERNAL_SERVER_ERROR,
        status_code: int = 500,
        is_operational: bool = True,
        details: Any = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code
        self.is_operational = is_operational
        self.details = details

    def to_dict(self) -> dict:
        return {
            "error": {
                "code": self.code,
                "message": str(self),
                **({"details": self.details} if self.details else {}),
            }
        }

    def __repr__(self) -> str:
        return f"AppError(code={self.code!r}, message={str(self)!r}, status={self.status_code})"


# ─── Common subclasses ────────────────────────────────────────────────────────

class NotFoundError(AppError):
    def __init__(self, resource: str, id: str) -> None:
        super().__init__(
            f"{resource} with id '{id}' not found",
            code=ErrorCode.NOT_FOUND,
            status_code=404,
        )


class ValidationError(AppError):
    def __init__(self, message: str, details: Any = None) -> None:
        super().__init__(
            message,
            code=ErrorCode.VALIDATION_ERROR,
            status_code=422,
            details=details,
        )


class AIServiceError(AppError):
    def __init__(self, message: str, code: ErrorCode = ErrorCode.AI_ANALYSIS_FAILED) -> None:
        super().__init__(message, code=code, status_code=500)
